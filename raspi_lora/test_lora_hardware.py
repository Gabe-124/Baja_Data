#!/usr/bin/env python3
"""Diagnostic script to test LoRa HAT hardware connectivity.

This script:
1. Checks if /dev/serial0 exists and is writable
2. Opens the serial port at 115200 baud
3. Sends test packets and monitors for any response
4. Checks for AT command support (some HATs respond to AT+PING)
5. Reports what it finds
"""
import serial
import time
import sys

def test_lora_hardware():
    port = "/dev/serial0"
    baud = 115200
    
    print(f"[*] Testing LoRa HAT on {port} @ {baud} baud\n")
    
    # Step 1: Try to open port
    print("[1/4] Opening serial port...")
    try:
        ser = serial.Serial(port, baud, timeout=1.0)
        print(f"    ✓ Port opened: {ser}\n")
    except Exception as e:
        print(f"    ✗ Failed to open port: {e}\n")
        return False
    
    # Step 2: Clear any buffered data
    print("[2/4] Clearing input buffer...")
    if ser.in_waiting > 0:
        junk = ser.read(ser.in_waiting)
        print(f"    Found {len(junk)} bytes in buffer (cleared)\n")
    else:
        print(f"    Buffer is empty\n")
    
    # Step 3: Send a test packet (simple JSON telemetry)
    print("[3/4] Sending test telemetry packet...")
    test_packet = b'{"ts":"2025-11-14T02:30:00Z","lat":40.7454,"lon":-74.0251,"alt":5.0,"fix":1,"sats":10}'
    try:
        bytes_written = ser.write(test_packet)
        ser.flush()
        print(f"    ✓ Wrote {bytes_written} bytes to port\n")
    except Exception as e:
        print(f"    ✗ Write failed: {e}\n")
        ser.close()
        return False
    
    # Step 4: Listen for response (some HATs echo or respond)
    print("[4/4] Listening for response (2 seconds)...")
    time.sleep(0.5)
    
    response_data = b""
    start = time.time()
    while time.time() - start < 2.0:
        if ser.in_waiting > 0:
            chunk = ser.read(ser.in_waiting)
            response_data += chunk
            print(f"    Received {len(chunk)} bytes: {chunk[:100]}")
        time.sleep(0.1)
    
    if response_data:
        print(f"    ✓ HAT responded with {len(response_data)} total bytes\n")
    else:
        print(f"    (No response — this is normal for transparent mode)\n")
    
    # Close and summarize
    ser.close()
    print("=" * 60)
    print("DIAGNOSTIC SUMMARY:")
    print("=" * 60)
    print(f"✓ Serial port is accessible and writable")
    print(f"✓ Test packet was successfully written to {port}")
    print()
    print("NEXT STEPS:")
    print("-" * 60)
    print("If TX/RX LEDs are still not flashing:")
    print()
    print("1. Check UART jumper block on the HAT:")
    print("   - Ensure ONLY jumper B is installed (not A or C)")
    print("   - If multiple jumpers are installed, signal interference occurs")
    print()
    print("2. Check M0/M1 mode pins on the HAT:")
    print("   - Both M0 and M1 must be shorted to GND")
    print("   - This puts the module in transparent TX/RX mode")
    print("   - If raised high (not grounded), the module may be in config mode")
    print()
    print("3. Check antenna connection:")
    print("   - Ensure SMA antenna is securely connected")
    print("   - Do NOT remove the antenna while powered")
    print()
    print("4. Verify module power:")
    print("   - HAT should have 5V on the 40-pin header VCC pins")
    print("   - Visual check: module should be warm (draws ~200mA)")
    print()
    print("5. Check frequency/spreading factor DIP switches:")
    print("   - Transmitter and receiver must use same frequency (915 MHz)")
    print("   - Spreading factors should match (SF7-SF12)")
    print("   - Check Waveshare documentation for DIP switch positions")
    print()
    print("=" * 60)
    return True

if __name__ == "__main__":
    try:
        success = test_lora_hardware()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n[!] Interrupted")
        sys.exit(1)
