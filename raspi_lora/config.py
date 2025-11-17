"""
Configuration Module for Raspberry Pi LoRa Sender

This module contains all configurable parameters for the GPS/LoRa telemetry system.
Modify these values to match your hardware setup without editing the main code.
"""
from dataclasses import dataclass
from datetime import timedelta


@dataclass
class Config:
    """Configuration dataclass holding all system parameters.
    
    Attributes organized by subsystem for easy modification.
    """
    
    # ==================== GPS Configuration ====================
    # Serial GPS settings (if using UART instead of I2C)
    gps_port: str = "/dev/serial0"  # Raspberry Pi hardware UART
    gps_baud: int = 38400           # Standard baud rate for u-blox GPS modules
    
    # ==================== LoRa HAT Configuration ====================
    # Serial connection to the Waveshare SX1262 LoRa HAT
    # Prefer the /dev/serial0 alias so the correct UART is selected on Pi 3/4 models
    lora_port: str = "/dev/serial0"         # Alias points to ttyAMA0 or ttyS0 depending on model
    lora_baud: int = 115200                 # Baud rate for LoRa HAT communication
    lora_transparent_mode: bool = False      # True = raw bytes, False = AT+SEND command mode
    
    # ==================== Timing Configuration ====================
    # How often to send telemetry packets
    send_interval: timedelta = timedelta(seconds=1)  # Send every 1 second (adjust for desired update rate)
    
    # Timeout for serial read/write operations
    serial_timeout: float = 1.0             # Seconds to wait for GPS/LoRa responses
    
    # ==================== I2C GPS Configuration ====================
    # Settings for SparkFun NEO-M8U connected via Qwiic (I2C)
    i2c_bus: int = 1                        # I2C bus number (1 is default on Raspberry Pi)
    i2c_addr: int = 0x42                    # I2C address of u-blox GPS (standard is 0x42)


# Global default configuration instance
# Import this in other modules: from config import DEFAULT_CONFIG
DEFAULT_CONFIG = Config()
