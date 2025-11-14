"""
Main Application - Raspberry Pi LoRa GPS Sender

This is the entry point for the telemetry transmitter that runs on the Raspberry Pi.
It reads GPS/IMU data and transmits it over LoRa radio to the laptop receiver.

Usage:
    python main.py --lora-port /dev/ttyAMA0 --interval 1
    python main.py --simulate  # Test mode without hardware
"""
import argparse
import logging
import time

from config import DEFAULT_CONFIG
from gps_reader import SerialGPS, SimulatedGPS
from lora_serial import LoRaSerial
from packet import make_packet


# Configure logging to show timestamps and log levels
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("raspi_lora")


def run(args):
    """Main application loop - reads GPS and transmits via LoRa.
    
    Args:
        args: Parsed command-line arguments from argparse
        
    Flow:
        1. Load configuration and apply command-line overrides
        2. Initialize GPS reader (I2C, serial, or simulation)
        3. Initialize LoRa transmitter
        4. Loop: read GPS -> create packet -> transmit -> sleep
    """
    # Start with default config and override with command-line args
    cfg = DEFAULT_CONFIG
    if args.gps_port:
        cfg.gps_port = args.gps_port
    if args.lora_port:
        cfg.lora_port = args.lora_port
    if args.interval is not None:
        cfg.send_interval = args.interval

    # Select the appropriate GPS backend based on how the hardware is wired
    if args.simulate:
        # Simulation mode: generates fake GPS data for testing
        gps = SimulatedGPS()
    else:
        if args.gps_backend == "i2c":
            # I2C mode: SparkFun NEO-M8U connected via Qwiic
            from gps_reader import I2CGPS

            gps = I2CGPS(i2c_bus=cfg.i2c_bus, i2c_addr=cfg.i2c_addr, timeout=cfg.serial_timeout)
        else:
            # Serial mode: GPS connected to UART pins
            gps = SerialGPS(port=cfg.gps_port, baud=cfg.gps_baud, timeout=cfg.serial_timeout)

    # Initialize LoRa transmitter (Waveshare SX1262 HAT)
    lora = LoRaSerial(port=cfg.lora_port, baud=cfg.lora_baud, timeout=cfg.serial_timeout, transparent=cfg.lora_transparent_mode)

    try:
        # Open serial connections early to catch hardware issues before the main loop
        if not args.simulate:
            gps.open()
        lora.open()
    except Exception as e:
        log.exception("Failed to open serial ports: %s", e)
        return

    log.info("Starting main loop: sending every %s", cfg.send_interval)
    try:
        while True:
            # Record loop start time to maintain accurate send intervals
            start = time.time()
            
            try:
                # Attempt to get a GPS fix (may return None if no fix available)
                data = gps.get_fix()
            except NotImplementedError as e:
                # GPS backend not implemented (e.g., I2C mode selected but not coded)
                log.error(str(e))
                return

            if data:
                # We have valid GPS data - create and transmit packet
                payload = make_packet(data)
                ok = lora.send_packet(payload)
                log.info("Sent packet (%d bytes) ok=%s: %s", len(payload), ok, payload.decode("utf-8"))
            else:
                # No GPS fix available this cycle (satellite acquisition in progress)
                log.debug("No GPS fix available this cycle")

            # Sleep for the remainder of the interval to maintain constant send rate
            elapsed = time.time() - start
            sleep_time = max(0, cfg.send_interval.total_seconds() - elapsed)
            time.sleep(sleep_time)
    except KeyboardInterrupt:
        # Clean shutdown on Ctrl+C
        log.info("Interrupted, exiting")
    finally:
        # Always close serial ports to release resources
        lora.close()
        if not args.simulate:
            gps.close()


def parse_args():
    """Parse command-line arguments.
    
    Returns:
        argparse.Namespace: Parsed arguments object
    """
    p = argparse.ArgumentParser(
        description="Raspberry Pi LoRa GPS sender for Baja telemetry",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run with I2C GPS and LoRa on /dev/ttyAMA0, send every 1 second
  python main.py --lora-port /dev/ttyAMA0 --interval 1
  
  # Run in simulation mode (no hardware needed)
  python main.py --simulate
  
  # Use serial GPS instead of I2C
  python main.py --gps-backend serial --gps-port /dev/serial0
        """
    )
    p.add_argument("--gps-port", help="GPS serial port (e.g. /dev/serial0) - only used with --gps-backend serial")
    p.add_argument("--lora-port", help="LoRa HAT serial port (e.g. /dev/ttyAMA0 or /dev/ttyS0)")
    p.add_argument("--interval", type=float, help="Send interval in seconds (default: 1)")
    p.add_argument("--gps-backend", choices=("i2c", "serial"), default="i2c", 
                   help="GPS connection method: i2c (Qwiic, default) or serial (UART)")
    p.add_argument("--simulate", action="store_true", 
                   help="Run in simulation mode with fake GPS data (no hardware required)")
    return p.parse_args()


if __name__ == "__main__":
    # Parse command-line arguments
    args = parse_args()
    
    # Convert interval from float (seconds) to timedelta object if provided
    if args.interval is not None:
        from datetime import timedelta
        args.interval = timedelta(seconds=args.interval)
    
    # Run the main application
    run(args)
