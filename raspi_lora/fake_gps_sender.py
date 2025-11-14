#!/usr/bin/env python3
"""Fake GPS data generator for exercising the Baja desktop front end.

This standalone script reuses the existing raspi_lora modules to build the same
JSON payloads that the Raspberry Pi transmitter normally emits, but it feeds
synthetic GPS/IMU data that traces a loop around Stevens Institute of
Technology in Hoboken, NJ.

Use it to drive a LoRa HAT (default) or to simply print packets for software
integration tests when radio hardware is unavailable.
"""
from __future__ import annotations

import argparse
import logging
import math
import random
import sys
import time
from datetime import UTC, datetime
from typing import Sequence, Tuple

from config import DEFAULT_CONFIG
try:
    from lora_serial import LoRaSerial
    _LORA_IMPORT_ERROR: Exception | None = None
except ModuleNotFoundError as exc:  # PySerial missing, etc.
    LoRaSerial = None  # type: ignore[assignment]
    _LORA_IMPORT_ERROR = exc

from packet import make_packet

# Rough loop around campus landmarks (lat, lon, altitude in meters)
STEVENS_WAYPOINTS: Sequence[Tuple[str, float, float, float]] = (
    ("Walker Gym", 40.744782, -74.027000, 26.0),
    ("Schaefer Center", 40.744255, -74.025195, 18.5),
    ("Babbio Center", 40.744948, -74.024621, 21.0),
    ("UCC", 40.745822, -74.024994, 19.0),
    ("Palmer Lawn", 40.746371, -74.026138, 15.5),
    ("Howe Center", 40.746028, -74.027139, 32.0),
)


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


class StevensRouteGenerator:
    """Produce smooth GPS fixes that follow a loop around Stevens campus."""

    def __init__(
        self,
        waypoints: Sequence[Tuple[str, float, float, float]] = STEVENS_WAYPOINTS,
        samples_per_leg: int = 20,
        lat_lon_jitter: float = 0.00002,
        alt_variation: float = 1.5,
    ) -> None:
        if samples_per_leg < 2:
            raise ValueError("samples_per_leg must be >= 2 for smooth interpolation")
        self.waypoints = waypoints
        self.samples_per_leg = samples_per_leg
        self.lat_lon_jitter = lat_lon_jitter
        self.alt_variation = alt_variation
        self._leg_idx = 0
        self._sample_idx = 0
        self.points_per_lap = len(self.waypoints) * self.samples_per_leg

    def next_fix(self) -> dict:
        start = self.waypoints[self._leg_idx]
        end = self.waypoints[(self._leg_idx + 1) % len(self.waypoints)]
        fraction = self._sample_idx / (self.samples_per_leg - 1)

        lat = _lerp(start[1], end[1], fraction)
        lon = _lerp(start[2], end[2], fraction)
        alt = _lerp(start[3], end[3], fraction)

        # Advance along the path
        self._sample_idx += 1
        if self._sample_idx >= self.samples_per_leg:
            self._sample_idx = 0
            self._leg_idx = (self._leg_idx + 1) % len(self.waypoints)

        # Add gentle noise so every lap is slightly different
        lat += random.uniform(-self.lat_lon_jitter, self.lat_lon_jitter)
        lon += random.uniform(-self.lat_lon_jitter, self.lat_lon_jitter)
        alt += math.sin(time.time() * 0.2) * self.alt_variation

        timestamp = datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
        fix = {
            "stamp": timestamp,
            "lat": lat,
            "lon": lon,
            "alt": alt,
            "fix": 1,
            "num_sats": random.randint(8, 13),
            "hdop": round(random.uniform(0.6, 1.2), 2),
            "imu": {
                "accel": [
                    round(random.uniform(-0.3, 0.3), 3),
                    round(random.uniform(-0.3, 0.3), 3),
                    round(-9.81 + random.uniform(-0.1, 0.1), 3),
                ],
                "gyro": [
                    round(random.uniform(-0.05, 0.05), 3),
                    round(random.uniform(-0.05, 0.05), 3),
                    round(random.uniform(-0.05, 0.05), 3),
                ],
            },
        }
        return fix


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Emit fake GPS packets around Stevens Institute and send over LoRa or stdout.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--lora-port", default=DEFAULT_CONFIG.lora_port, help="Serial device for LoRa HAT")
    parser.add_argument("--lora-baud", type=int, default=DEFAULT_CONFIG.lora_baud, help="LoRa serial baud rate")
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_CONFIG.send_interval.total_seconds(),
        help="Seconds between packets",
    )
    parser.add_argument("--laps", type=int, help="Stop after this many laps (default: run forever)")
    parser.add_argument(
        "--samples-per-leg",
        type=int,
        default=20,
        help="Interpolation steps between waypoints (higher = smoother path)",
    )
    parser.add_argument("--jitter", type=float, default=0.00002, help="Random lat/lon jitter per fix")
    parser.add_argument("--print", action="store_true", help="Echo JSON packets to stdout for debugging")
    parser.add_argument(
        "--no-lora",
        action="store_true",
        help="Skip talking to LoRa hardware (implied when running on a laptop)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=("DEBUG", "INFO", "WARNING", "ERROR"),
        help="Logging verbosity",
    )
    return parser.parse_args()


def _calc_max_points(generator: StevensRouteGenerator, laps: int | None) -> int | None:
    if laps is None:
        return None
    return laps * generator.points_per_lap


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s fake_gps_sender: %(message)s",
    )
    log = logging.getLogger("fake_gps_sender")

    generator = StevensRouteGenerator(
        samples_per_leg=args.samples_per_leg,
        lat_lon_jitter=args.jitter,
    )
    max_points = _calc_max_points(generator, args.laps)

    lora = None
    if not args.no_lora:
        if LoRaSerial is None:
            log.error(
                "LoRa mode requested but 'pyserial' is not installed (original error: %s)",
                _LORA_IMPORT_ERROR,
            )
            log.info("Install requirements with: pip install -r requirements.txt")
            return 1
        try:
            lora = LoRaSerial(
                port=args.lora_port,
                baud=args.lora_baud,
                timeout=DEFAULT_CONFIG.serial_timeout,
                transparent=DEFAULT_CONFIG.lora_transparent_mode,
            )
            lora.open()
            log.info("LoRa serial opened on %s @ %d", args.lora_port, args.lora_baud)
        except Exception as exc:  # pragma: no cover - hardware failures
            log.error("Unable to open LoRa serial: %s", exc)
            return 1
    else:
        log.info("Running without LoRa hardware (stdout only mode)")

    emitted = 0
    try:
        while True:
            fix = generator.next_fix()
            payload = make_packet(fix)

            if lora:
                ok = lora.send_packet(payload)
                log.debug(
                    "LoRa tx #%d (%d bytes) ok=%s lat=%.5f lon=%.5f",
                    emitted + 1,
                    len(payload),
                    ok,
                    fix["lat"],
                    fix["lon"],
                )
            if args.print or not lora:
                sys.stdout.write(payload.decode("utf-8") + "\n")
                sys.stdout.flush()

            emitted += 1
            if max_points is not None and emitted >= max_points:
                log.info("Completed %d lap(s); exiting", args.laps)
                break

            time.sleep(max(0.0, args.interval))
    except KeyboardInterrupt:
        log.info("Interrupted; shutting down")
    finally:
        if lora:
            lora.close()
            log.info("LoRa serial closed")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
