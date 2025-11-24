# XIAO ESP32S3 + Wio-SX1262 + L76K GNSS Starter

Bring the **Seeed Studio XIAO ESP32S3**, **Wio-SX1262 Meshtastic/LoRa carrier**, and the **L76K GNSS add-on** together to form a location-aware LoRa beacon. This folder contains a reference Arduino sketch plus the wiring notes, dependencies, and tuning tips needed to get the trio talking.

> **Tested hardware references**
>
> - Wio-SX1262 pin map is mirrored from the RadioLib discussion on the official kit (see [RadioLib discussion #1361](https://github.com/jgromes/RadioLib/discussions/1361)).
> - L76K GNSS wiring recommendations follow the Seeed wiki guide, *[Getting Started with L76K GNSS Module for SeeedStudio XIAO](https://wiki.seeedstudio.com/get_start_l76k_gnss/)*.

---

## What you get

| File | Purpose |
| --- | --- |
| `xiao_esp32s3_lora_gnss.ino` | Full Arduino sketch that reads NMEA sentences from the L76K (via `Serial1`/TinyGPSPlus) and periodically transmits compact JSON payloads over the SX1262 radio (RadioLib). |
| `README.md` | This setup and wiring guide. |

---

## Bill of materials

| Item | Notes |
| --- | --- |
| XIAO ESP32S3 (Sense or standard) | Arduino-compatible ESP32-S3 with castellated pins + board-to-board mezzanine. |
| Wio-SX1262 for XIAO kit | Provides the Semtech SX1262 radio, battery charger, RF switch, and board-to-board “Sense” connector. |
| L76K GNSS Module for Seeed Studio XIAO | Quectel L76K based add-on with active antenna + 1PPS LED. |
| U.FL → SMA whip antennas | One for 2.4 GHz (Wi-Fi/BLE) and one for 868/915 MHz LoRa. |
| Optional LiPo 3.7 V battery | Plugs into the JST on the Wio board for untethered use. |

---

## Wiring & pin map

### 1. XIAO ↔ Wio-SX1262 board-to-board connections

When the XIAO ESP32S3 is plugged into the Wio-SX1262 carrier via the “Sense” board-to-board (B2B) connector, the radio lands on fixed ESP32S3 GPIOs. The RadioLib example pins that work with the stock carrier are:

| Function | XIAO GPIO | Notes |
| --- | --- | --- |
| `LORA_SCK` | **GPIO7** | Shared SPI clock for SX1262.
| `LORA_MISO` | **GPIO8** | SPI MISO.
| `LORA_MOSI` | **GPIO9** | SPI MOSI.
| `LORA_NSS` | **GPIO41** | Chip select.
| `LORA_RST` | **GPIO42** | Reset line.
| `LORA_BUSY` | **GPIO40** | Busy status from radio.
| `LORA_DIO1` | **GPIO39** | Required interrupt for RadioLib (DIO1).
| `LORA_ANT_SW` | **GPIO38** | Controls the RF switch (TX/RX). RadioLib exposes this through `setRfSwitchPins`.
| `LORA_TXEN` | **GPIO1** | Some carrier revisions expose TX enable; leave high for P2P mode if needed.
| `LORA_RXEN` | **GPIO2** | Likewise for RX enable. The reference sketch toggles both through `setRfSwitchPins` rather than driving them manually.

> The constants above match the macros in the sketch (`LORA_*`). If you break out the Wio module using wires instead of the B2B connector, update the values to whatever GPIOs you choose.

### 2. XIAO ↔ L76K GNSS module

The L76K board exposes labeled castellated pads. Run short dupont wires or solder jumpers from the GNSS module into convenient XIAO pads (or the expansion board headers):

| L76K Pad | Suggested XIAO pin | Reason |
| --- | --- | --- |
| `VIN` | 3V3 | L76K accepts 3.0–3.6 V. Drop 5 V only if you route through the carrier’s regulator.
| `GND` | GND | Common ground.
| `TX` | **GPIO44** (`GNSS_RX_PIN` in code) | Connects to ESP32S3 `Serial1` RX input. GPIO44 is exposed on the Sense mezzanine and is unused by the Wio carrier.
| `RX` | **GPIO43** (`GNSS_TX_PIN`) | ESP32S3 TX output back into the L76K.
| `1PPS` | Optional: GPIO3 (`1PPS_PIN`) | Gives you a 1 Hz pulse once the module has a fix. The sketch uses it to blink the LED faster when the fix is stable.
| `EN` | 3V3 (through 10 kΩ) | Holds the GNSS module enabled. Tie low to power it down.

If GPIO43/44 are inconvenient, you can re-map `Serial1.begin()` inside the sketch to whichever spare pins you prefer (D4/D5, etc.). Just keep them free from the SPI bus used by the SX1262.

### 3. Antennae and RF hygiene

- Attach the LoRa whip (or external SMA) **before** powering the Wio-SX1262.
- Keep the GNSS active antenna at least a few centimeters away from the LoRa antenna to reduce desense when transmitting.

---

## Software prerequisites

1. **Arduino IDE 2.x** or PlatformIO.
2. **Seeed ESP32 board package** (`https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`). Select **Seeed XIAO ESP32S3** as the board, set Flash to 16 MB QIO, PSRAM enabled.
3. **Libraries (Arduino Library Manager or `git submodule`):**
   - [`RadioLib`](https://github.com/jgromes/RadioLib) ≥ 7.2.0 (SX126x support + RF switch helpers).
   - [`RadioBoards`](https://github.com/radiolib-org/RadioBoards) (optional but recommended; it already knows the XIAO ↔ Wio pin map if you include `#include <RadioBoards.h>`).
   - [`TinyGPSPlus`](https://github.com/mikalhart/TinyGPSPlus) ≥ 1.0.3 for NMEA parsing.
   - [`ArduinoJson`](https://arduinojson.org/) **optional** if you want to build structured payloads instead of string concatenation.

Install everything through **Tools → Manage Libraries…** so the sketch compiles out of the box.

---

## How the reference sketch works

1. **Boot & sanity checks**
   - Starts `Serial` (USB) at 115200 for debug output.
   - Configures `Serial1` on GPIO44/43 at 9600 bps (L76K default).
   - Initializes the SX1262 via RadioLib, setting frequency, bandwidth, spreading factor, coding rate, output power, and enabling the RF switch pins.

2. **GNSS ingestion loop**
   - Continuously feeds bytes from `Serial1` into `TinyGPSPlus`.
   - Tracks last-fix time, HDOP, satellite count, altitude, and speed.
   - Optional 1PPS interrupt toggles the user LED for visual confirmation of a fix.

3. **Packet assembly**
   - Every `TELEMETRY_INTERVAL_MS` (default 5000 ms) the sketch builds a concise JSON string:
     ```json
     {"lat":40.7454,"lon":-74.0251,"alt":5.1,"sats":9,"hdop":0.9,"v":12.2,"age":1.0}
     ```
   - The payload is < 80 bytes so it easily fits in an SX1262 frame.

4. **LoRa transmit & status**
   - Sends the payload with `radio.transmit(payload)` and prints the RSSI/packet status to USB serial.
   - If the radio is busy or no GNSS fix is available, it backs off and retries on the next interval.

---

## Customisation knobs

Open `xiao_esp32s3_lora_gnss.ino` and tweak these constants near the top:

| Macro | Default | Description |
| --- | --- | --- |
| `LORA_FREQUENCY_MHZ` | `915.0` | Set to 868.0 for EU, 923.3 for AU, etc. Stay within your regional ISM band plan. |
| `LORA_SPREADING_FACTOR` | `9` | Increase for longer range (but slower airtime). |
| `LORA_BANDWIDTH_KHZ` | `125.0` | 125 kHz is a good balance for GPS telemetry. |
| `LORA_CODING_RATE` | `7` | Represents 4/7. Use 8 for 4/8 if you need more forward error correction. |
| `LORA_TX_POWER_DBM` | `17` | +17 dBm keeps duty-cycle reasonable without overheating. |
| `TELEMETRY_INTERVAL_MS` | `5000UL` | How often to publish a LoRa packet. |
| `REQUIRE_MIN_SATS` | `4` | Minimum satellite count before sending location data. |
| `GNSS_BAUD` | `9600` | Match the baud rate stored in the L76K (change with CASIC commands if needed). |

---

## Build, flash, and test

1. Connect the stacked boards to your Mac with USB-C.
2. In Arduino IDE:
   - Board: `Seeed XIAO ESP32S3`
   - Port: whichever `/dev/cu.usbmodem…`
   - PSRAM: `OPI PSRAM` (enabled)
3. `Sketch → Upload` (the first flash may take ~30 s because of PSRAM init).
4. Open the serial monitor at **115200 bps**.
   - You should see SX1262 init logs followed by GNSS stats.
   - Once outdoors, the GNSS LED will blink at 1 Hz and the serial log will display `Fix OK` lines.
   - LoRa transmissions will print `[SX1262] TX done (XX ms, RSSI -YY dBm)`.

If the sketch reboots before `SX1262 begin` finishes, double-check the pin map (especially `BUSY` and `DIO1`).

---

## Troubleshooting tips

| Symptom | Fix |
| --- | --- |
| `RadioLib` reports `ERR_CHIP_NOT_FOUND` | The SPI pins are mis-mapped or the Wio carrier isn’t fully seated. Confirm with `Tools → Serial Plotter` that `BUSY` toggles. |
| GNSS data never leaves `Location: INVALID` | Move outdoors, confirm the active antenna is plugged in, and make sure `Serial1` pins aren’t swapped. The L76K TX pad must land on the ESP32 RX pin. |
| Packets collide with Meshtastic firmware | This sketch uses raw RadioLib P2P framing. If you want Meshtastic integration, disable this sketch and flash the official Meshtastic build instead. |
| Large JSON payloads time out | Keep payloads < 200 bytes and consider lowering `LORA_SPREADING_FACTOR` so airtime stays short. |

---

## Next steps

- Replace the simple JSON string with CBOR or protobuf for better airtime efficiency.
- Add sensor telemetry (IMU, battery voltage) to the packet body.
- Feed the LoRa output into your existing Baja data receiver (`desktop_client` folder) for end-to-end testing.

PRs welcome if you refine the wiring tables or add PlatformIO integration!
