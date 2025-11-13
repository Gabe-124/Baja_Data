# Raspberry Pi → LoRa Sender (Baja Telemetry Transmitter)

This Python project reads GPS/IMU data and sends compact JSON telemetry packets over LoRa radio to the desktop receiver. It's optimized for Raspberry Pi 3A+ and can run in simulation mode with fake GPS data.

## What this repo provides

- **`main.py`** — Main CLI: reads GPS/IMU and sends JSON packets periodically over LoRa.
- **`gps_reader.py`** — GPS reader with multiple backends:
  - `SerialGPS` — Read NMEA sentences over UART (simple, widely compatible)
  - `I2CGPS` — Read UBX binary messages over I2C/Qwiic (more accurate)
  - `SimulatedGPS` — Generate fake GPS data for testing (default: Hoboken, NJ)
- **`lora_serial.py`** — LoRa transmitter interface via transparent UART serial.
- **`config.py`** — Configuration (ports, baud rates, timing).
- **`requirements.txt`** — Minimal Python dependencies for Pi3A+.

## Hardware Setup (Assumed)

- **GPS Module:** SparkFun NEO-M8U connected via Qwiic/I2C (default) or UART serial
- **LoRa HAT:** Waveshare SX1262 connected to Pi's UART (/dev/ttyAMA0)
- **LoRa Mode:** Transparent UART mode (raw bytes transmitted as-is)
- **Frequency:** 915 MHz (US/Americas)

## Quick Start on Raspberry Pi 3A+

### 1. Prepare the system

```bash
# Enable UART in raspi-config (if using serial GPS or LoRa)
sudo raspi-config
# Interface Options → Serial Port → Yes for serial hardware, No for console
```

### 2. Install Python environment

```bash
cd /path/to/raspi_lora
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
pip install -r requirements.txt
```

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
python main.py --lora-port /dev/ttyAMA0 --interval 1 --gps-backend i2c
```

### 5. Run with serial GPS (if wired to UART instead)

```bash
python main.py --gps-backend serial --gps-port /dev/serial0 --lora-port /dev/ttyAMA0 --interval 1
```

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
| "No module named 'serial'" | Run `pip install -r requirements.txt` in the venv |
| "Permission denied" on /dev/ttyAMA0 | Add Pi user to dialout group: `sudo usermod -a -G dialout pi` |
| GPS stuck at "no fix" | Ensure GPS has clear sky view; outdoor placement helps. Check `config.py` timeout settings. |
| LoRa not transmitting | Verify HAT is in transparent mode; check baud rate (115200 standard); try `--lora-port /dev/ttyS0` if using GPIO UART |

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

