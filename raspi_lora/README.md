# Raspberry Pi → LoRa Sender (Baja Telemetry Transmitter)

This Python project reads GPS/IMU data and sends compact JSON telemetry packets over LoRa radio to the desktop receiver. It's optimized for Raspberry Pi 3A+ and can run in simulation mode with fake GPS data.

## What this repo provides

- **`main.py`** — Main CLI: reads GPS/IMU and sends JSON packets periodically over LoRa.
- **`gps_reader.py`** — GPS reader with multiple backends:
  - `SerialGPS` — Read NMEA sentences over UART (simple, widely compatible)
  - `I2CGPS` — Read UBX binary messages over I2C/Qwiic (more accurate)
  - `SimulatedGPS` — Generate fake GPS data for testing (default: Hoboken, NJ)
- **`lora_serial.py`** — LoRa transmitter interface via transparent UART serial.
- **`fake_gps_sender.py`** — Standalone CLI that replays a fake lap around Stevens via LoRa or stdout for front-end tests.
- **`config.py`** — Configuration (ports, baud rates, timing).
- **`requirements.txt`** — Minimal Python dependencies for Pi3A+.

## Hardware Setup (Assumed)

- **GPS Module:** SparkFun NEO-M8U connected via Qwiic/I2C (default) or UART serial
- **LoRa HAT:** Waveshare SX1262 connected to Pi's UART (/dev/ttyAMA0)
- **LoRa Mode:** Transparent UART mode (raw bytes transmitted as-is)
- **Frequency:** 915 MHz (US/Americas)

### Waveshare SX1262 915 MHz LoRa HAT (GPIO stack)

When stacking the Waveshare SX1262 LoRa HAT that ships from the Amazon link above onto the Pi’s 40-pin header, use the onboard jumper blocks to direct the UART correctly:

| Jumper block | Position for GPIO use | Why |
| --- | --- | --- |
| **UART selector (A/B/C)** | **B** closed, A & C open | Routes the SX1262’s UART to the Pi’s GPIO pins instead of the CP2102 USB bridge. |
| **Mode pins (M0/M1)** | **Both shorted to GND** | Puts the module in transparent transmit/receive mode so it behaves like a raw serial pipe (required for `LoRaSerial`). |

> The Waveshare wiki describes A/B/C as “A = USB→LoRa, B = Pi GPIO→LoRa, C = USB→Pi”. Leaving multiple jumpers installed can cross-connect signals—only install the one you need.

Additional wiring/bring-up notes:

1. Attach the SMA antenna (or the included u.FL whip) **before** powering the Pi so the PA has a load.
2. Seat the HAT on the Pi’s 40-pin header and power the Pi normally. The HAT takes 5 V from the header and level-shifts to 3.3 V internally—no extra wiring needed.
3. Enable the Pi UART (`sudo raspi-config` → *Interface Options* → *Serial Port* → *Login shell?* **No**, *Enable hardware serial?* **Yes**). This sets `enable_uart=1` and exposes the `/dev/serial0` alias.
4. Use the defaults in `config.py` (`lora_port="/dev/serial0"`, baud 115200). Override with `python main.py --lora-port /dev/serial0` if you’ve edited the config.
5. Optional: to reconfigure the module over USB, move the UART jumper to **A** and leave M0/M1 in the mode you need; move it back to **B** when returning to Pi-controlled operation.

If you need to change the module’s firmware settings (frequency, power, WOR, etc.), temporarily lift **M1** (place it high) to enter configuration mode per Waveshare’s manual, push the new settings via their RF_Setting utility, then return both M0/M1 low for runtime.

## Quick Start on Raspberry Pi 3A+

### 1. Prepare the system

```bash
# Enable UART in raspi-config (if using serial GPS or LoRa)
sudo raspi-config
# Interface Options → Serial Port → Yes for serial hardware, No for console
```

### 1b. Verify the UART overlay and device nodes

After exiting raspi-config and rebooting, confirm that the serial alias exists:

```bash
ls -l /dev/serial* /dev/ttyAMA* /dev/ttyS*
```

If nothing shows up:

1. Ensure `/boot/firmware/config.txt` (Bookworm) or `/boot/config.txt` (Bullseye/legacy) contains `enable_uart=1`.
2. On Pi 3/4 models, add `dtoverlay=miniuart-bt` (or `dtoverlay=disable-bt`) so Bluetooth doesn’t occupy `ttyAMA0`.
3. Reboot. The `ls` command should now reveal `/dev/serial0 → /dev/ttyAMA0` (or `/dev/ttyS0`).

You can set those flags without the menu:

```bash
sudo tee -a /boot/firmware/config.txt <<'EOF'
enable_uart=1
dtoverlay=miniuart-bt
EOF
sudo reboot
```

### 2. Install Python environment (with [uv](https://docs.astral.sh/uv/))

```bash
# Install uv once per machine (skip if already available)
curl -LsSf https://astral.sh/uv/install.sh | sh

cd /path/to/raspi_lora
uv venv                     # creates .venv with the system Python
source .venv/bin/activate   # activates the environment
uv pip sync requirements.txt
```

> Prefer stock `pip`? The traditional `python3 -m venv venv && pip install -r requirements.txt` flow still works, but uv keeps installs deterministic and fast.

### 3. Test with simulation mode (no hardware needed)

```bash
# Run in simulation mode with fake GPS data (Hoboken, NJ)
python main.py --simulate --interval 1
```

Output:
```
2025-11-13 12:34:56,789 INFO raspi_lora: Starting main loop: sending every 0:00:01
2025-11-13 12:34:56,890 INFO raspi_lora: Sent packet (92 bytes) ok=True: {"ts":"2025-11-13T12:34:56Z","lat":40.7454,"lon":-74.0251,"alt":5.0,"fix":1,"sats":10,"hdop":0.8}
```

### 4. Run with real hardware (I2C GPS)

```bash
# Connect real GPS and LoRa HAT, then:
python main.py --lora-port /dev/serial0 --interval 1 --gps-backend i2c
```
  
### 5. Run with serial GPS (if wired to UART instead)

```bash
python main.py --gps-backend serial --gps-port /dev/serial0 --lora-port /dev/serial0 --interval 1
```

## Front-end testing with the standalone fake sender

Use `fake_gps_sender.py` when you want continuous Hoboken telemetry without touching a real Pi or GPS module. It reuses the same packet format and LoRa serial driver as `main.py`, so the desktop receiver and UI behave exactly as they do on race day.

```bash
# Send packets over a plugged-in LoRa HAT while also echoing JSON for debugging
python fake_gps_sender.py --interval 0.5 --print

# Laptop-only dry run (no LoRa). Useful for piping into dev tools.
python fake_gps_sender.py --no-lora --print --laps 2
```

Key options:

- `--laps`: stop after N loops around campus (omit to run forever).
- `--samples-per-leg`: higher numbers create smoother turns.
- `--jitter`: tweak how much random motion is added each fix.
- `--print`: always echo packets so you can tail/pipe them into another process.
- `--no-lora`: skip initializing the radio when you're on a desktop.

## Configuration

Edit `config.py` to change:
- GPS backend type (I2C, serial, or simulated)
- Serial ports and baud rates
- Transmission interval (default: 1 second)
- I2C bus and address (for Qwiic GPS)

## GPS Data Location (Fake Mode)

When running with `--simulate`, fake GPS data is centered near:
- **Location:** Stevens Institute of Technology, Hoboken, NJ
- **Coordinates:** 40.7454°N, 74.0251°W
- **Movement:** Simulates vehicle driving north/east at slow speed

Modify `base_lat` and `base_lon` in `SimulatedGPS.__init__()` in `gps_reader.py` to change location.

## Packet Format

Telemetry packets sent over LoRa are minimal JSON (compressed for airtime efficiency):

```json
{
  "ts": "2025-11-13T12:34:56Z",
  "lat": 40.7454,
  "lon": -74.0251,
  "alt": 5.0,
  "fix": 1,
  "sats": 10,
  "hdop": 0.8,
  "imu": {
    "accel": [0.1, -0.05, -9.81],
    "gyro": [0.01, 0.01, 0.05]
  }
}
```

The desktop LoRa receiver (`desktop_client/lora_receiver.js`) parses these packets and displays telemetry.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No module named 'serial'" | Activate `.venv` and run `uv pip sync requirements.txt` (or `pip install -r requirements.txt`) |
| "Permission denied" on /dev/ttyAMA0 | Add Pi user to dialout group: `sudo usermod -a -G dialout pi` |
| `ls /dev/serial*` shows nothing | Make sure `enable_uart=1` and `dtoverlay=miniuart-bt` are in `/boot/firmware/config.txt`, then reboot. Run `ls -l /dev/serial* /dev/ttyAMA* /dev/ttyS*` again. |
| GPS stuck at "no fix" | Ensure GPS has clear sky view; outdoor placement helps. Check `config.py` timeout settings. |
| LoRa not transmitting | Verify HAT is in transparent mode; check baud rate (115200 standard); try `--lora-port /dev/ttyS0` if using GPIO UART |
| LoRa TX/RX LEDs not flashing | **Hardware checklist**: (1) UART jumper **B** only (not A or C). (2) M0/M1 both grounded (shorted to GND). (3) Antenna connected and secure. (4) 5V on 40-pin header. (5) Check DIP switches for frequency (915 MHz) and SF match TX/RX. Run `python test_lora_hardware.py` to verify port is open and writable. |

## Pi3A+ Optimization Notes

- **RAM:** 512 MB (tight). Avoid loading large libraries unnecessarily.
- **Storage:** Minimal (~65 MB after Python + deps). Consider SD card speed.
- **CPU:** Single-core, 1 GHz. Sampling every 1–2 seconds is realistic.
- **Dependencies:** Kept to 3 minimal packages (pyserial, pynmea2, smbus2).
- **Virtual environment:** Highly recommended to avoid system Python conflicts.

## Next Steps / Integration

- The desktop client (`desktop_client/main.js`) receives packets via USB LoRa and displays location on a map.
- Extend `make_packet()` in `main.py` to include additional telemetry (temperature, pressure, battery voltage, etc.).
- Modify `SimulatedGPS` to simulate more realistic movement patterns (curved paths, acceleration).

