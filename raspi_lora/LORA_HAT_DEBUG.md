# LoRa HAT Hardware Debug Checklist

## Software is Working ✓

The fake GPS sender **is successfully writing data** to `/dev/serial0` at 115200 baud. See DEBUG logs:

```
2025-11-14 02:23:37,617 INFO fake_gps_sender: LoRa serial opened on /dev/serial0 @ 115200
2025-11-14 02:23:37,640 INFO fake_gps_sender: LoRa TX: Wrote 199 bytes (of 199) to /dev/serial0 @ 115200 baud
2025-11-14 02:23:39,664 INFO fake_gps_sender: LoRa TX: Wrote 199 bytes (of 199) to /dev/serial0 @ 115200 baud
... (repeating every 2 seconds)
```

✓ Test confirmed: `test_lora_hardware.py` successfully opened port and wrote test packet.

## TX/RX LEDs Not Flashing = Hardware Issue

If the TX/RX LEDs on the SX1262 HAT are **not flashing**, the module is **not transmitting**, even though software is sending data. This is a hardware/configuration issue.

---

## Hardware Checklist

### 1. **UART Jumper Block (A/B/C) - Critical**

**Position:** Only **B** should be populated with a jumper.

```
Before you start:
- REMOVE any jumpers from positions A and C
- INSTALL a jumper ONLY on position B
- This connects SX1262 UART → Pi GPIO pins (not USB)

Visual check:
- Look at the jumper block labeled A/B/C on the HAT
- You should see exactly ONE jumper on the middle position (B)
- If you see jumpers on A and/or C, remove them NOW
```

**Why?** Waveshare documented A/B/C as:
- **A** = USB ↔ Module (use only for USB-based config tools)
- **B** = **Pi GPIO ↔ Module** (use for transparent Pi operation)
- **C** = USB ↔ Pi (cross-connection, usually unused)

If A, B, and C are all populated, the signals will short and the module won't respond correctly.

---

### 2. **M0/M1 Mode Pins - Critical**

**Position:** Both **M0 and M1 must be shorted to GND** (ground).

```
Physical check:
- Look at the module surface (the black rectangular component)
- Locate the M0 and M1 pins (usually marked on the module)
- Each should have a jumper wire or solder bridge connecting it to a nearby GND pad
- Visual: two small black jumpers (or solder blobs) very close to the module

If raised high (not grounded):
- The module enters CONFIGURATION mode instead of TX/RX mode
- TX/RX LEDs may not flash
- The module listens for AT commands instead of transparent packets
```

**Module mode table:**
| M0 | M1 | Mode |
|----|----|----|
| GND | GND | **Transparent TX/RX (required)** |
| GND | 5V | Fixed point-to-point |
| 5V | GND | Fixed broadcast |
| 5V | 5V | Configuration (module listens for AT commands) |

---

### 3. **Antenna Connection - Very Important**

```
Visual check:
- Locate the SMA antenna connector (threads onto the HAT module)
- Verify the antenna is **physically present and screwed in tightly**
- Try wiggling it gently; it should not be loose
- Do NOT remove the antenna while power is on (PA requires a load)

If antenna is missing:
- PA section has no load → potential module damage over time
- Module may throttle or disable transmission as protection
```

---

### 4. **Power Supply - Check the 40-pin Header**

```
Visual check on the Pi:
- The HAT is stacked on the Pi's 40-pin GPIO header
- Verify the HAT is fully seated (pins are fully inserted)
- No gaps between HAT PCB and Pi header

Power verification:
- Powered-on HAT should be warm (draws ~200 mA during TX)
- Touch the module: if it's cold, it's not powered
- If Pi is running, HAT should already have 5V
- Check Pi power supply is adequate (≥2A for Pi + HAT)
```

---

### 5. **Frequency & Spreading Factor (DIP Switches)**

```
Visual check:
- Locate small DIP switches on the HAT PCB (usually labeled SW1, SW2)
- Count the number of switches and note which are ON/OFF
- Consult Waveshare documentation for the exact configuration

Critical:
- Transmitter (your Pi) and Receiver (USB LoRa on laptop) must match:
  ✓ FREQUENCY (usually 915 MHz for US)
  ✓ SPREADING FACTOR (SF7 is faster, SF12 is longest range)
  ✓ BANDWIDTH (usually 125 kHz)
  ✓ CODING RATE (usually 4/5)

If mismatched:
- Module will transmit, but receiver won't decode packets
- TX LED may flash, but RX on receiver won't show packets
```

---

## Quick Diagnostic Commands

### Test 1: Verify Software Is Sending Data

```bash
cd ~/Baja_Data/raspi_lora
uv run python fake_gps_sender.py --laps 1 --interval 2 --log-level DEBUG
```

Expected output (should repeat every 2 seconds):
```
2025-11-14 02:23:37,640 INFO fake_gps_sender: LoRa TX: Wrote 199 bytes (of 199) to /dev/serial0 @ 115200 baud
```

✓ If you see "Wrote XXX bytes", **software is working correctly**.

---

### Test 2: Verify Hardware Port Is Writable

```bash
cd ~/Baja_Data/raspi_lora
uv run python test_lora_hardware.py
```

Expected:
```
✓ Serial port is accessible and writable
✓ Test packet was successfully written to /dev/serial0
```

✓ If you see these checkmarks, **the Pi can talk to the serial port**.

---

### Test 3: Manual Low-Level Port Test

```bash
python3 << 'EOF'
import serial
ser = serial.Serial("/dev/serial0", 115200, timeout=1.0)
test = b"HELLO_LORA_HAT_12345"
bytes_written = ser.write(test)
print(f"Wrote {bytes_written} bytes")
ser.close()
EOF
```

If no error: **serial port is accessible**.

---

## Next Steps

1. **Check UART jumper (A/B/C)** — is only **B** populated?
2. **Check M0/M1** — are both pins grounded?
3. **Check antenna** — is it connected and tight?
4. **Check power** — is the HAT warm?
5. **Run `test_lora_hardware.py`** — does software see the port?

If software passes all tests but LEDs don't flash, the issue is **100% hardware configuration**. Start with the jumper block and M0/M1 pins—those are the most common causes.

---

## Reference: Waveshare SX1262 Pinout

When troubleshooting, you may need to reference:
- **[Waveshare SX1262 915 MHz LoRa HAT Wiki](https://www.waveshare.com/wiki/SX1262_915MHz_LoRa_HAT)**
- Look for the jumper block diagram and mode pin table
- Check the DIP switch frequency/SF settings for your region

---

## Still Not Working?

1. **Isolate the problem:**
   - Run `fake_gps_sender.py --no-lora --laps 1 --print` — does this work? (tests Python only, not hardware)
   - Run `test_lora_hardware.py` — does port open and write succeed?

2. **Check for physical damage:**
   - Is the HAT PCB cracked or bent?
   - Are any solder joints visibly damaged?
   - Is the module burned (dark discoloration)?

3. **Try a known-good receiver:**
   - If you have a second LoRa USB receiver, plug it in on the laptop
   - Run the sender and watch for packets in `lora_receiver.js` (desktop client)
   - If packets still don't appear, the HAT module itself may be faulty

4. **Collect logs:**
   ```bash
   uv run python fake_gps_sender.py --laps 1 --interval 2 --log-level DEBUG > lora_debug.log 2>&1
   ```
   Share `lora_debug.log` with the team or Waveshare support.
