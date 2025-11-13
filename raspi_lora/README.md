# Raspberry Pi -> LoRa sender (for Baja team)

This small Python project reads position/IMU data from a GPS+IMU (SparkFun NEO-M8U) and sends compact JSON packets over a LoRa HAT attached to the Raspberry Pi's UART.

What this repo provides
- `main.py` — CLI: reads GPS/IMU and sends packets periodically to the LoRa HAT via serial.
- `gps_reader.py` — GPS reader with a serial (NMEA) backend and an I2C stub you can extend.
- `lora_serial.py` — Simple transparent-serial LoRa sender (writes payload bytes to UART).
- `config.py` — default configuration you can edit.
- `requirements.txt` — Python deps.

Default assumptions
- The NEO-M8U GPS is connected via Qwiic/I2C (default bus 1, addr 0x42). The code parses UBX messages (NAV-POSLLH) over I2C.
- If your GPS is wired to a UART instead, you can run the serial backend by passing `--gps-backend serial`.
- The Waveshare LoRa HAT is in transparent UART mode (writing raw bytes to the HAT's UART transmits them over the air).
- Frequency: 915 MHz (US). LoRa parameters (SF/BW) should be configured on the HAT firmware if required.

Quick start (on the Pi)
1. Install system prerequisites and enable serial in raspi-config (enable UART, disable console if needed).
2. Create a virtualenv and install requirements:

```bash
python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt
```

3. Run the sender (default: I2C GPS, send every 1 second):

```bash
python main.py --lora-port /dev/ttyAMA0 --interval 1
```

Simulation mode
You can run `python main.py --simulate` to send fake GPS/IMU packets (useful before hardware is wired).

Next steps / Questions for you
- Is the NEO-M8U wired via Qwiic (I2C) or to a UART on the Pi?
- Is the LoRa HAT already configured in transparent UART mode, or does it expect AT commands? If AT commands, please share the HAT's command reference or example send command (e.g. `AT+SEND` style).
- Do you want any encryption or signing of packets?

When you confirm wiring and LoRa mode I can update the code to use I2C/UBX and/or AT command flows if required.
