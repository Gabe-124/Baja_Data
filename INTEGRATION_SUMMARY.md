# Baja Telemetry System - Integration Summary

## Overview

Your Raspberry Pi LoRa telemetry system is now fully integrated and ready to run on a **Pi3A+** with **fake GPS data** centered near **Stevens Institute of Technology** in Hoboken, NJ.

## What Was Updated

### 1. **SimulatedGPS** (gps_reader.py)
- ✅ Changed default location from San Francisco to **Hoboken, NJ**
- ✅ Coordinates: `40.7454°N, 74.0251°W` (Stevens Institute of Technology)
- ✅ Simulates realistic movement (northbound/eastbound)
- ✅ Generates complete GPS data with IMU (accelerometer/gyroscope)

### 2. **Requirements.txt** 
- ✅ Optimized for Pi3A+ (512MB RAM, limited storage)
- ✅ Minimal dependencies: `pyserial`, `pynmea2`, `smbus2`
- ✅ Added comments documenting which packages can be removed if not using certain backends

### 3. **README.md**
- ✅ Complete Pi3A+ setup guide
- ✅ Instructions for testing with `--simulate` flag
- ✅ Hardware wiring assumptions documented
- ✅ Troubleshooting section for common Pi3A+ issues
- ✅ Packet format documented

## Packet Format Verification

✅ **Confirmed:** Fake GPS packets are fully compatible with your desktop client.

Sample packet (from Hoboken):
```json
{
  "ts": "2025-11-13T19:13:39Z",
  "lat": 40.74545,
  "lon": -74.02505,
  "alt": 6.0,
  "fix": 1,
  "sats": 10,
  "hdop": 0.8,
  "imu": {
    "accel": [0.1, -0.05, -9.81],
    "gyro": [0.01, 0.01, 0.05]
  }
}
```

Your `lora_receiver.js` parses this exactly as expected.

## Quick Start

### Test on your Mac (before Pi)
```bash
cd /Users/gabeayan/Desktop/Baja_Data/raspi_lora
python main.py --simulate --interval 1
```

### Deploy on Pi3A+
```bash
# On the Pi:
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run in simulation mode (no hardware)
python main.py --simulate --interval 1

# Run with real LoRa HAT once wired
python main.py --lora-port /dev/ttyAMA0 --interval 1
```

## Architecture

```
Raspberry Pi 3A+
├── SimulatedGPS (fake data, Hoboken)
├── make_packet() → JSON telemetry
└── LoRa HAT (115200 baud, transparent mode)
    └── [Over the air]
    
Desktop Client (Electron)
├── lora_receiver.js (USB LoRa port)
├── Parses telemetry packets
└── track_map.js → Displays location on map
```

## What You Need to Confirm

For full hardware integration, please let me know:

1. **LoRa Hardware:**
   - Is the Waveshare HAT connected to `/dev/ttyAMA0` or `/dev/ttyS0`?
   - Baud rate: 115200 (confirmed in your code)
   - Is it in **transparent mode** (raw bytes transmitted directly)?

2. **GPS Hardware (optional - fake mode works now):**
   - Will you use I2C (Qwiic) or serial UART for the GPS module?
   - SparkFun NEO-M8U address on I2C: `0x42` (default, can change in config.py)

3. **Deployment:**
   - Should the Pi auto-start the telemetry sender on boot?
   - Any specific update rate preferred? (currently 1 Hz)

## Next Steps

- ✅ Test `python main.py --simulate` locally to verify packet flow
- ✅ Connect desktop client USB LoRa receiver when ready
- 🔲 Wire GPS and LoRa HAT to Pi
- 🔲 Run with real hardware once wired
- 🔲 (Optional) Configure systemd service for auto-start on boot

## Files Modified

- `raspi_lora/gps_reader.py` — Updated SimulatedGPS location to Hoboken
- `raspi_lora/requirements.txt` — Added Pi3A+ optimization comments
- `raspi_lora/README.md` — Comprehensive setup guide for Pi3A+
- `.gitignore` — Created (handles node_modules, __pycache__, .venv, logs, etc.)

All other files remain unchanged and fully functional.
