"""Utility helpers for building telemetry packets."""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Dict


def make_packet(gps_data: Dict[str, Any]) -> bytes:
    """Convert GPS/IMU data into a compact JSON packet for transmission.
    
    Args:
        gps_data: Dictionary containing GPS fix data from the reader
                  Expected keys: stamp, lat, lon, alt, fix, num_sats, hdop, imu (optional)
    
    Returns:
        bytes: UTF-8 encoded JSON packet ready for transmission
    """
    ts = gps_data.get("stamp")
    if not ts:
        ts = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")

    pkg = {
        "ts": ts,
        "lat": gps_data.get("lat"),
        "lon": gps_data.get("lon"),
        "alt": gps_data.get("alt"),
        "fix": gps_data.get("fix"),
        "sats": gps_data.get("num_sats"),
        "hdop": gps_data.get("hdop"),
    }
    if "imu" in gps_data:
        pkg["imu"] = gps_data["imu"]

    return json.dumps(pkg, separators=(",", ":")).encode("utf-8")
