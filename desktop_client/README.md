# To-do 
- have the lap times sync based on imported data from results page
- Create box for client Xaio
- Create onboard housing for Xaio, GPS, LoRa, and Battery
- Add gps track creation
- Add a config page
- Create an app Icon
- Add a data / graph section 


# Baja Telemetry Client

Cross-platform desktop application for real-time Baja SAE telemetry monitoring via LoRa radio. Displays GPS position, lap timing, and performance analytics.

## Features

- **Real-time GPS Tracking** - Live map display with car position and track path
- **Lap Timing System** - Automatic lap detection with configurable start/finish line
- **Delta Analysis** - Live comparison to your best lap (ahead/behind indicators)
- **Lap History** - Complete lap times table with delta to best
- **Competitor Data** - Import and compare against other teams' lap times
- **Cross-Platform** - Runs on macOS and Windows
- **LoRa Integration** - Receives data from Waveshare USB LoRa module

## Hardware Requirements

- Waveshare USB LoRa module (SX1262 based)
- Seeed Studio Xaio esp32s3 lora module 
- Seeed Studio GNSS module for Xaio 
- Mac or Windows computer

## Installation

### 1. Install Node.js

Download and install Node.js (v18 or later):  
https://nodejs.org/

### 2. Clone/Download this project

Navigate to the `desktop_client` folder.

### 3. Install dependencies

```bash
npm install
```

This will install:
- Electron (desktop framework)
- serialport (USB LoRa communication)
- Leaflet (map visualization)

## Usage

### Starting the Application

```bash
npm start
```

### First-Time Setup

1. **Connect LoRa USB Module** - Plug in your Waveshare USB LoRa device
2. **Select Serial Port** - Choose the port from the dropdown (e.g., `/dev/ttyUSB0` on Mac/Linux or `COM3` on Windows)
3. **Click Connect** - Establish connection to the LoRa receiver
4. **Set Start/Finish Line** - Double-click on the map where you want the start/finish line
   - This creates a 10-meter detection radius
   - The app will auto-detect lap completion when crossing this zone
5. **Test the USB Link (optional)** - After connecting, click **Start Test TX** to stream synthetic telemetry packets at 915 MHz. Click the button again (or disconnect/close the app) to stop the transmission.

### No-Hardware Simulation Mode

Want to poke around the dashboard without a Raspberry Pi or LoRa radio nearby? Use the **Start Simulation** button in the header:

1. Launch the desktop app (no cables required).
2. Click **Start Simulation** – the lap table and map reset, then begin receiving fake GPS packets that drive a smooth loop around the map.
3. Watch the track trace, lap timer, and delta widgets update exactly as they would on race day.
4. Click **Stop Simulation** when you are ready to reconnect real hardware; the Connect button will re-enable automatically.

> Note: The simulation intentionally disables the hardware test-transmit button. Stop the simulator before plugging in the LoRa receiver so the app can take control of the real serial port again.

### During a Session

- **Map Controls**
  - 📍 Track Center button - Fits the full drawn/recorded track and pauses auto-follow
  - 🏎️ Car Follow button - Snaps back to the car and re-enables auto-centering
  - 🛰️ / 🗺️ toggle - Switch between satellite imagery and the default street layer
  - � Walk Track button - Clears the live trace and records the GPS feed while you physically walk the course; tap again to stop and instantly make that trace the active track
  - �🛠️ Draw/Edit button - Opens the toolbar to sketch or tweak the reference track
  - 💾 Save + 📁 Import - Export the current track to GeoJSON or load an existing layout (GPX/GeoJSON)
  - Double-click map - Set start/finish line location (10 m radius)
  - Drag map - Temporarily disables auto-centering; tap 🏎️ or 📍 to resume
  - Preferences… (Cmd/Ctrl + ,) - Launch the settings window for theme selection (and future global options)

#### Walking the Track to Create a Layout

1. Connect to your handheld GPS transmitter (or start Simulation mode if you just want to practice).
2. Click the 🚶 **Walk Track** button. The app clears the blue live trail, locks auto-centering on, and starts sampling every ~1.5 m.
3. Walk the full loop of the course with the GPS module. You can pause briefly; the recorder ignores sub‑meter jitter so the path stays clean.
4. Click the 🚶 button again to stop. The trace is simplified, closed, drawn in orange as the editable reference track, and automatically saved to the config (and ready for 💾 Save/📁 Import).
5. Optionally tap 🛠️ to fine-tune corners, then hit 💾 to export the new layout for teammates.

- **Lap Timing**
  - Current lap time updates in real-time
  - Delta shows if you're ahead (green) or behind (red) your best lap
  - Lap times table shows all completed laps
  - Best lap is highlighted in blue

- **GPS Status**
  - Fix quality indicator (No Fix / GPS Fix / DGPS / RTK)
  - Satellite count
  - HDOP (accuracy metric)

### Race Clock (4-hour endurance)

- The Race Results header now includes a **Race Clock** tile and a **Start 4h Race** button.
- Tapping the button stores the official race start time and begins counting down from four hours (04:00:00).
- If you restart the clock mid-race, you will be asked to confirm so you do not accidentally wipe the running clock.
- The status line under the timer shows whether the clock is waiting to start, actively running, or complete. If any offsets have been applied, an "Adj" badge is also displayed.

#### Adjusting the race clock from the terminal

If the green flag drops before you hit the start button, run the helper script to nudge the countdown forward or backward without touching the UI:

```bash
npm run adjust-race-timer -- --minutes -2      # subtract 2 minutes
npm run adjust-race-timer -- --seconds 30      # add 30 seconds
npm run adjust-race-timer -- --minutes 1 --status  # add 1 minute, then print the new clock
```

Accepted flags:

- `--minutes` / `-m`
- `--seconds` / `-s`
- `--hours` / `-H`
- `--milliseconds` / `--ms`
- `--status` prints the live clock after applying the adjustment

All adjustments are stored in the same Electron `userData` directory that the app already uses, so the UI, CLI, and multiple machines stay in sync automatically.

### Configuration

Settings are automatically saved, including:
- Start/finish line location
- Serial port selection
- Map view preferences
- Theme preference (light or dark)

Use **Baja Telemetry ▸ Preferences…** on macOS (or **File ▸ Preferences…** on Windows/Linux) — or press **Cmd/Ctrl + ,** — to open the dedicated configuration window. The theme toggle now lives there, and additional configuration panels will appear in upcoming updates.

Configuration file location:
- macOS: `~/Library/Application Support/baja-telemetry-client/`
- Windows: `%APPDATA%/baja-telemetry-client/`

## Building Distributable Apps

### For macOS

```bash
npm run build:mac
```

Creates a `.dmg` installer in the `dist/` folder.

### For Windows

```bash
npm run build:win
```

Creates an `.exe` installer in the `dist/` folder.

## Serial Port Configuration

The Waveshare USB LoRa module typically appears as:
- **macOS/Linux**: `/dev/ttyUSB0` or `/dev/cu.usbserial-*`
- **Windows**: `COM3`, `COM4`, etc.

If your port doesn't appear in the dropdown:
1. Check USB connection
2. Install CH340/CP210x drivers if needed
3. Restart the application

### Forcing the Waveshare USB LoRa Dongle to 915 MHz (US band)

The Waveshare USB LoRa stick ships in transparent UART mode, so the desktop app cannot command it to retune on the fly. If your spectrum analyzer still reports **868 MHz**, reprogram the dongle once and it will stay on **915 MHz** until changed again.

1. **Quit the Baja Telemetry app** so nothing is using the serial port.
2. **Confirm the macOS device path** (already done for you):
  ```bash
  ls /dev/cu.usb* /dev/tty.usb*
  ```
  Latest output: `/dev/cu.usbmodem58960341261` (TTY twin is the same number).
3. **Move to a Windows environment** (native PC, Boot Camp, or a Windows VM/Parallels/Fusion). Waveshare’s "RF Setting" utility only runs on Windows.
4. **Download and install** from Waveshare’s SX1262 USB LoRa wiki:
  - CP210x/CH340 serial driver (if Windows doesn’t already have one)
  - `RF Setting` configuration utility (zip contains `RFSetting.exe`)
5. **Enter configuration mode:** unplug the dongle, press and hold the lone push button, plug the dongle into Windows while keeping the button pressed for ~2 seconds, then release. The status LED will slow-blink and Windows will enumerate a new COM port (check Device Manager → Ports (COM & LPT)).
6. **Program the US profile inside RF Setting:**
  - Launch `RFSetting.exe`
  - Select the COM port that just appeared and click *Open*
  - Set **Frequency** to `915.0 MHz` (or `915000000 Hz` depending on UI)
  - Match the Pi settings: e.g. Bandwidth `125 kHz`, Spreading Factor `SF9` (or whatever you use), Coding Rate `4/5`, TX power 20–22 dBm, air data rate `62.5 kbps` if available
  - Ensure *Transparent / UART* mode is selected (not WOR or fixed-point)
  - Click *Write* and wait for the success prompt, then *Close*
7. **Return to transparent runtime:** unplug the dongle, plug it back in **without** holding the button (LED steady). Move it back to the Mac.
8. **Verify on macOS** by rerunning the port check command above, launching Baja Telemetry, hitting **Start Test TX**, and using your Flipper (or other SDR) to confirm it now transmits at ~915 MHz.

> Tip: If you ever need to retune again, repeat steps 5–7. There is no way to change the RF band from the Electron app because the dongle exposes only a raw serial pipe when M0/M1 are tied low.

## Data Format

The app expects JSON packets from the Raspberry Pi in this format:

```json
{
  "ts": "2025-11-13T12:34:56Z",
  "lat": 37.7749,
  "lon": -122.4194,
  "alt": 10.5,
  "fix": 1,
  "sats": 8,
  "hdop": 0.9,
  "imu": {
    "accel": [0.0, 0.0, -9.8],
    "gyro": [0.0, 0.0, 0.0]
  }
}
```

## Troubleshooting

### No GPS Data Received

- Check LoRa USB connection
- Verify correct serial port selected
- Ensure Raspberry Pi transmitter is running and powered
- Check LoRa frequency matches (915MHz for US)
- Verify line-of-sight between transmitter and receiver

### Map Not Loading

- Requires internet connection for map tiles
- Check firewall/proxy settings

### Lap Not Detected

- Ensure start/finish line is set (double-click on map)
- Check detection radius (default 10 meters)
- Verify GPS fix quality is good (>= GPS Fix)

## Importing Competitor Data

To compare against other teams:

1. Click the 📁 button in the Competitor Times section
2. Select a CSV file with this format:

```csv
Team,BestLapTime
Team A,125.340
Team B,127.890
Team C,129.560
```

Lap times should be in seconds (decimals allowed).

## Exporting Your Data

Lap times and track data can be exported:

- Open browser DevTools (View → Developer → Developer Tools)
- In console, run: `lapManager.exportLaps()`
- Copy the JSON output and save to a file

To export track as GeoJSON:
```javascript
trackMap.exportTrackGeoJSON()
```

### Saving Track Layouts from the UI

- Click the 💾 Save Track button (above the map tools).
- Choose a destination file when the operating system save dialog appears (defaults to your Documents folder) and press **Save**.
- The app writes the current drawn layout (or the last recorded GPS trace if no custom layout exists) to that `.geojson` file **and** stores a copy in its config so the track is automatically restored the next time you launch the app.
- To re-use the saved file elsewhere, just choose the 📁 Import button and pick the `.geojson` file you previously exported.

## Advanced Configuration

### Changing Detection Radius

Edit the radius parameter in `renderer.js`:

```javascript
lapManager.setStartFinishLine(lat, lng, 20); // 20 meters
trackMap.setStartFinishLine(lat, lng, 20);
```

### Using Satellite Imagery

In `track_map.js`, replace the tile layer URL:

```javascript
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19,
}).addTo(this.map);
```

## Development

### Project Structure

```
desktop_client/
├── package.json           # Dependencies and build config
├── main.js                # Electron main process
├── preload.js             # IPC bridge (security layer)
├── lora_receiver.js       # Serial port communication
├── index.html             # Main UI layout
├── styles.css             # Application styles
├── renderer.js            # UI controller
├── lap_manager.js         # Lap timing logic
└── track_map.js           # Map visualization
```

### Key Technologies

- **Electron** - Cross-platform desktop framework
- **Node.js SerialPort** - USB serial communication
- **Leaflet.js** - Interactive maps
- **Vanilla JavaScript** - No framework overhead for maximum performance

## License

MIT

## Support

For issues or questions related to:
- **Hardware setup** - Check Waveshare documentation
- **Raspberry Pi code** - See `raspi_lora/README.md`
- **This application** - Open an issue on GitHub

---

Built for Baja SAE racing teams 🏁
