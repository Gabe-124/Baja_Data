"""
GPS/IMU Reader Module

Provides multiple backends for reading GPS position data from the SparkFun NEO-M8U:
1. SerialGPS - Reads NMEA sentences over UART (simple, widely compatible)
2. I2CGPS - Reads UBX binary messages over I2C/Qwiic (more accurate, recommended)
3. SimulatedGPS - Generates fake data for testing without hardware

The NEO-M8U has dead reckoning capability (combines GPS + IMU) for improved
position accuracy during GPS outages.
"""
import time
import logging
from typing import Optional, Dict

import pynmea2  # NMEA sentence parser
import serial   # PySerial for UART communication


log = logging.getLogger(__name__)


class GPSReader:
    """Abstract base class for GPS readers.
    
    All GPS backends must implement get_fix() which returns a dict with position data.
    """

    def get_fix(self) -> Optional[Dict]:
        """Attempt to read current GPS position.
        
        Returns:
            dict: Position data with keys: lat, lon, alt, fix, num_sats, hdop, stamp
                  Returns None if no fix is available
        """
        raise NotImplementedError()


class SerialGPS(GPSReader):
    """Read GPS data from NMEA sentences over a serial (UART) connection.
    
    This is the simplest GPS interface - the module outputs human-readable
    NMEA sentences (text lines) that we parse for position data.
    
    Supported sentence types:
        - GGA: Position, altitude, fix quality, satellites
        - RMC: Position, speed, course
    """
    def __init__(self, port: str = "/dev/serial0", baud: int = 38400, timeout: float = 1.0):
        """Initialize serial GPS reader.
        
        Args:
            port: Serial device path (e.g., /dev/serial0 on Raspberry Pi)
            baud: Baud rate - u-blox modules default to 38400 or 9600
            timeout: Read timeout in seconds
        """
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.ser = None

    def open(self):
        """Open the serial port connection."""
        log.info("Opening GPS serial port %s @ %d", self.port, self.baud)
        self.ser = serial.Serial(self.port, self.baud, timeout=self.timeout)

    def close(self):
        """Close the serial port connection."""
        if self.ser and self.ser.is_open:
            self.ser.close()

    def get_fix(self):
        """Read NMEA sentences until we get valid position data.
        
        Reads lines from the serial port and attempts to parse them as NMEA.
        Returns the first valid GGA (position/altitude) or RMC (position/speed) sentence found.
        
        Returns:
            dict: GPS data or None if timeout expires without valid data
        """
        if self.ser is None:
            self.open()

        deadline = time.time() + self.timeout
        while time.time() < deadline:
            try:
                # Read one line from the GPS module
                line = self.ser.readline().decode("ascii", errors="ignore").strip()
            except Exception as e:
                log.debug("Serial read error: %s", e)
                return None
            if not line:
                continue
            
            # Try to parse as NMEA sentence
            try:
                msg = pynmea2.parse(line)
            except pynmea2.ParseError:
                # Not a valid NMEA sentence, skip it
                continue

            # GGA: Global Positioning System Fix Data
            # Contains: time, position, fix quality, satellites, HDOP, altitude
            if isinstance(msg, pynmea2.types.talker.GGA):
                return {
                    "stamp": msg.timestamp.isoformat() if hasattr(msg, "timestamp") else None,
                    "lat": msg.latitude,          # Decimal degrees
                    "lon": msg.longitude,         # Decimal degrees
                    "alt": float(msg.altitude) if msg.altitude not in (None, "") else None,  # Meters above sea level
                    "fix": int(msg.gps_qual) if msg.gps_qual is not None else None,  # 0=no fix, 1=GPS, 2=DGPS
                    "num_sats": int(msg.num_sats) if msg.num_sats is not None else None,  # Satellite count
                    "hdop": float(msg.horizontal_dil) if msg.horizontal_dil not in (None, "") else None,  # Accuracy metric
                }

            # RMC: Recommended Minimum Navigation Information
            # Contains: time, date, position, speed, course
            if isinstance(msg, pynmea2.types.talker.RMC):
                return {
                    "stamp": msg.datestamp.isoformat() + "T" + msg.timestamp.isoformat() if hasattr(msg, "datestamp") and hasattr(msg, "timestamp") else None,
                    "lat": msg.latitude,
                    "lon": msg.longitude,
                    "speed_knots": float(msg.spd_over_grnd) if msg.spd_over_grnd not in (None, "") else None,
                    "track_angle": float(msg.true_course) if msg.true_course not in (None, "") else None,
                }

        # Timeout expired without getting valid data
        return None


class I2CGPS(GPSReader):
    """Read GPS data from UBX binary messages over I2C (Qwiic interface).
    
    The SparkFun NEO-M8U supports I2C communication using the Qwiic connector.
    This backend reads UBX protocol messages (binary format) instead of NMEA text.
    
    UBX advantages:
        - More efficient (binary vs text)
        - Access to more message types and configuration
        - Better for high-rate updates
    
    This implementation:
        - Polls the I2C bus for available bytes
        - Assembles UBX frames with proper sync/checksum validation
        - Parses NAV-POSLLH messages for position data
        
    To add more message types (IMU, velocity, etc.), extend _try_parse_buf()
    to handle additional class/ID combinations.
    """

    def __init__(self, i2c_bus=1, i2c_addr=0x42, timeout=1.0):
        """Initialize I2C GPS reader.
        
        Args:
            i2c_bus: I2C bus number (1 is default on Raspberry Pi)
            i2c_addr: GPS module I2C address (0x42 is u-blox default)
            timeout: How long to poll for data before giving up (seconds)
        """
        from smbus2 import SMBus, i2c_msg

        self.i2c_bus_num = i2c_bus
        self.i2c_addr = i2c_addr
        self.timeout = timeout
        self.bus = None
        self.i2c_msg = i2c_msg

        # Receive buffer for assembling UBX frames across multiple reads
        self._buf = bytearray()

    def open(self):
        """Open I2C bus connection."""
        from smbus2 import SMBus

        self.bus = SMBus(self.i2c_bus_num)

    def close(self):
        """Close I2C bus connection."""
        if self.bus:
            try:
                self.bus.close()
            except Exception:
                pass

    @staticmethod
    def _ubx_checksum(data: bytes) -> bytes:
        """Calculate UBX checksum (Fletcher algorithm).
        
        UBX messages have a 2-byte checksum covering the message class through payload.
        
        Args:
            data: Bytes to checksum (message class + ID + length + payload)
            
        Returns:
            bytes: Two-byte checksum [CK_A, CK_B]
        """
        ck_a = 0
        ck_b = 0
        for b in data:
            ck_a = (ck_a + b) & 0xFF
            ck_b = (ck_b + ck_a) & 0xFF
        return bytes([ck_a, ck_b])

    def _try_parse_buf(self):
        """Search buffer for complete UBX frames and parse them.
        
        UBX frame format:
            Sync bytes: 0xB5 0x62
            Class: 1 byte
            ID: 1 byte
            Length: 2 bytes (little-endian)
            Payload: <length> bytes
            Checksum: 2 bytes
            
        Returns:
            tuple: (msg_class, msg_id, payload) or None if no complete frame found
        """
        buf = self._buf
        hdr = b"\xb5\x62"  # UBX sync characters
        idx = buf.find(hdr)
        if idx == -1:
            # No sync header found; keep last 2 bytes in case header splits across reads
            if len(buf) > 2:
                del buf[:-2]
            return None

        # Need at least: header(2) + class(1) + id(1) + length(2) = 6 bytes
        if len(buf) < idx + 6:
            return None

        # Extract payload length (little-endian uint16 at offset 4-5)
        length = buf[idx + 4] | (buf[idx + 5] << 8)
        total = idx + 6 + length + 2  # header + header_data + payload + checksum
        if len(buf) < total:
            # Frame incomplete, wait for more data
            return None

        # Extract complete message
        msg = bytes(buf[idx:total])
        
        # Verify checksum (computed over bytes 2 through 2+4+length-1)
        ck = self._ubx_checksum(msg[2 : 6 + length])
        if ck != msg[6 + length : 6 + length + 2]:
            # Checksum mismatch - skip this sync header and continue searching
            del buf[idx : idx + 2]
            return None

        # Valid frame! Remove consumed bytes from buffer
        del buf[:total]

        # Extract frame components
        msg_class = msg[2]
        msg_id = msg[3]
        payload = msg[6 : 6 + length]
        return (msg_class, msg_id, payload)

    def _parse_nav_posllh(self, payload: bytes):
        """Parse UBX NAV-POSLLH message (position lat/lon/height).
        
        NAV-POSLLH (class=0x01, id=0x02) payload structure (28 bytes):
            iTOW (U4): GPS time of week (ms)
            lon (I4): Longitude (deg * 1e-7)
            lat (I4): Latitude (deg * 1e-7)
            height (I4): Height above ellipsoid (mm)
            hMSL (I4): Height above mean sea level (mm)
            hAcc (U4): Horizontal accuracy estimate (mm)
            vAcc (U4): Vertical accuracy estimate (mm)
            
        Args:
            payload: Raw UBX payload bytes
            
        Returns:
            dict: Position data or None if payload invalid
        """
        if len(payload) < 28:
            return None
        import struct

        # Unpack binary data (little-endian format)
        # <I = unsigned int, i = signed int
        iTOW, lon, lat, height, hMSL = struct.unpack_from("<IiiiI", payload, 0)
        
        # Convert from raw units to standard units
        return {
            "stamp": None,  # Could convert iTOW to timestamp if needed
            "lat": lat * 1e-7,      # Convert from degrees * 1e7 to decimal degrees
            "lon": lon * 1e-7,      # Convert from degrees * 1e7 to decimal degrees
            "alt": float(height) / 1000.0,  # Convert from mm to meters
        }

    def get_fix(self):
        """Poll I2C bus and parse UBX messages until NAV-POSLLH is found.
        
        Continuously reads available bytes from the GPS module over I2C,
        assembles UBX frames, and returns when a position message is decoded.
        
        Returns:
            dict: Position data or None if timeout expires
        """
        import time

        if self.bus is None:
            self.open()

        deadline = time.time() + self.timeout
        while time.time() < deadline:
            try:
                # Request up to 64 bytes from the I2C GPS module
                # The module has an internal buffer; read empties it incrementally
                msg = self.i2c_msg.read(self.i2c_addr, 64)
                self.bus.i2c_rdwr(msg)
                chunk = bytes(msg)
                if chunk:
                    self._buf.extend(chunk)
            except Exception:
                # I2C read may fail if no data available; continue polling
                pass

            # Try to extract a complete UBX frame from the buffer
            parsed = self._try_parse_buf()
            if parsed:
                cls, mid, payload = parsed
                # NAV-POSLLH: Navigation Position message (class=0x01, id=0x02)
                if cls == 0x01 and mid == 0x02:
                    return self._parse_nav_posllh(payload)

            # Small sleep to avoid hammering the I2C bus
            time.sleep(0.01)

        # Timeout - no valid position data received
        return None


class SimulatedGPS(GPSReader):
    """Generate fake GPS data for testing without hardware.
    
    Produces a moving position that increments with each call to get_fix().
    Useful for:
        - Testing the transmitter/receiver pipeline
        - Developing the desktop client UI
        - Debugging without access to GPS satellites
    
    Default location: Stevens Institute of Technology, Hoboken, NJ
    """
    
    def __init__(self):
        """Initialize simulator with a counter."""
        self._t = 0
        # Stevens Institute of Technology, Hoboken, NJ
        self.base_lat = 40.7454
        self.base_lon = -74.0251

    def get_fix(self):
        """Generate a fake GPS position.
        
        Creates a position that moves slightly on each call, simulating
        a vehicle driving in a straight line near Stevens Institute of Technology.
        
        Returns:
            dict: Simulated GPS data with all fields populated
        """
        # Increment position counter
        self._t += 1
        
        # Generate a position near Stevens Institute of Technology (Hoboken, NJ)
        # that moves with each call, simulating a vehicle on a track
        return {
            "stamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "lat": self.base_lat + (self._t * 0.00005),   # Move north (slower for track simulation)
            "lon": self.base_lon + (self._t * 0.00005),   # Move east
            "alt": 5.0 + (self._t % 10),                  # Oscillating altitude (5-15m)
            "fix": 1,                                      # GPS fix quality (1 = GPS)
            "num_sats": 10,                                # Satellite count
            "hdop": 0.8,                                   # Horizontal accuracy (good)
            "imu": {                                        # Fake IMU data
                "accel": [0.1, -0.05, -9.81],              # Accelerometer (m/s²)
                "gyro": [0.01, 0.01, 0.05]                 # Gyroscope (rad/s)
            },
        }
