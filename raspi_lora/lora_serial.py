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
from typing import List, Optional

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
        # Re-use the serial timeout but never wait less than 1 second for AT responses
        self._at_response_timeout = max(timeout, 1.0)

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
                bytes_written = self.ser.write(payload)
                self.ser.flush()  # Ensure bytes are sent immediately
                log.info("LoRa TX: Wrote %d bytes (of %d) to %s @ %d baud", bytes_written, len(payload), self.port, self.baud)
                if bytes_written < len(payload):
                    log.warning("LoRa TX: Only wrote %d of %d bytes!", bytes_written, len(payload))
                
                # No response expected in transparent mode - assume success
                return True
            else:
                # AT command mode: wrap payload in AT+SEND=<len>,<payload>\r\n and wait for an OK
                at_cmd = self._build_at_send_command(payload)
                responses = self._send_at_command(at_cmd)
                if not responses:
                    log.warning("LoRa AT: no response after send")
                    return False

                success = any("OK" in line.upper() or "SEND" in line.upper() for line in responses)
                if not success:
                    log.warning("LoRa AT: unexpected response %s", responses)
                return success
        except Exception as e:
            log.exception("Failed to send packet: %s", e)
            return False

    def _build_at_send_command(self, payload: bytes) -> bytes:
        """Construct an AT+SEND command for the given payload.

        Many LoRa HATs expect ASCII-safe data inside the AT command. Our telemetry
        is UTF-8 JSON, so strip CR/LF just in case before embedding the payload.
        """
        try:
            payload_str = payload.decode("utf-8")
        except UnicodeDecodeError:
            # Fallback to latin-1 so every byte is represented, even though
            # payloads are expected to be UTF-8 JSON.
            payload_str = payload.decode("latin-1")

        sanitized = payload_str.replace("\r", "").replace("\n", "")
        cmd = f"AT+SEND={len(payload)},{sanitized}"
        return cmd.encode("ascii", errors="ignore")

    def _send_at_command(self, command: bytes) -> List[str]:
        """Send an AT command and collect response lines until completion."""
        if self.ser is None:
            self.open()

        if not command.endswith(b"\r\n"):
            command += b"\r\n"

        log.debug("LoRa AT >> %s", command.decode("ascii", errors="ignore").strip())
        # Clear any stale bytes before issuing the next command
        if self.ser.in_waiting:
            self.ser.reset_input_buffer()

        self.ser.write(command)
        self.ser.flush()

        responses: List[str] = []
        deadline = time.time() + self._at_response_timeout
        while time.time() < deadline:
            line = self.ser.readline()
            if not line:
                continue
            text = line.decode("ascii", errors="ignore").strip()
            if not text:
                continue

            responses.append(text)
            log.debug("LoRa AT << %s", text)
            upper = text.upper()
            if any(token in upper for token in ("OK", "SEND", "ERROR", "FAIL")):
                break

        return responses
