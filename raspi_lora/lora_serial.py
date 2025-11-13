"""
LoRa Serial Communication Module

Handles transmission of telemetry packets via the Waveshare SX1262 LoRa HAT.

The HAT operates in "transparent UART mode" by default, meaning any bytes written
to the serial port are transmitted over the air on the configured frequency/spreading factor.

LoRa Parameters (configured via DIP switches or AT commands on the HAT):
    - Frequency: 915MHz (for US/Americas)
    - Spreading Factor: SF7-SF12 (higher = longer range, slower speed)
    - Bandwidth: 125kHz, 250kHz, or 500kHz
    - Coding Rate: 4/5, 4/6, 4/7, 4/8
    
For maximum range, use SF12. For maximum speed, use SF7.
The receiver (USB LoRa) must be configured with matching parameters.
"""
import logging
import serial  # PySerial for UART communication
import time
from typing import Optional

log = logging.getLogger(__name__)


class LoRaSerial:
    """LoRa transmitter interface via serial (UART) connection.
    
    Supports two modes:
        1. Transparent mode (default): Raw bytes written to UART are transmitted
        2. AT command mode: Packets wrapped in AT commands (not implemented here)
    """
    def __init__(self, port: str = "/dev/ttyAMA0", baud: int = 115200, timeout: float = 1.0, transparent: bool = True):
        """Initialize LoRa serial interface.
        
        Args:
            port: Serial device path for the LoRa HAT
                  Common values: /dev/ttyAMA0, /dev/ttyS0, /dev/serial0
            baud: Baud rate (115200 is standard for Waveshare HATs)
            timeout: Read/write timeout in seconds
            transparent: True = transparent mode, False = AT command mode
        """
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.transparent = transparent
        self.ser: Optional[serial.Serial] = None

    def open(self):
        """Open the serial connection to the LoRa HAT."""
        log.info("Opening LoRa serial %s @ %d", self.port, self.baud)
        self.ser = serial.Serial(self.port, self.baud, timeout=self.timeout)

    def close(self):
        """Close the serial connection."""
        if self.ser and self.ser.is_open:
            self.ser.close()

    def send_packet(self, payload: bytes) -> bool:
        """Transmit a payload over LoRa radio.
        
        In transparent mode, the payload is sent directly. The LoRa HAT will:
            1. Buffer the bytes
            2. Modulate them using the configured LoRa parameters
            3. Transmit on the air
            
        The receiver must be tuned to the same frequency and parameters.
        
        Args:
            payload: Raw bytes to transmit (typically JSON telemetry)
            
        Returns:
            bool: True if transmission was successful (or appeared to be)
            
        Note:
            LoRa is a simplex protocol - no acknowledgment by default.
            Success means "bytes were written to the HAT", not "received by laptop".
        """
        if self.ser is None:
            self.open()

        try:
            if self.transparent:
                # Transparent mode: write bytes directly to serial port
                # The HAT transmits whatever we write
                self.ser.write(payload)
                self.ser.flush()  # Ensure bytes are sent immediately
                log.debug("Wrote %d bytes to LoRa serial", len(payload))
                
                # No response expected in transparent mode - assume success
                return True
            else:
                # AT command mode (example implementation - not used by default)
                # Some HATs require wrapping payload in an AT command like:
                #   AT+SEND=<length>,<payload>\r\n
                cmd = b"AT+SEND=" + str(len(payload)).encode() + b"," + payload + b"\r\n"
                self.ser.write(cmd)
                self.ser.flush()
                
                # Wait for acknowledgment from the HAT
                resp = self.ser.readline().decode("ascii", errors="ignore").strip()
                log.debug("AT resp: %s", resp)
                
                # Check if response indicates success
                return "OK" in resp or "SEND" in resp
        except Exception as e:
            log.exception("Failed to send packet: %s", e)
            return False
