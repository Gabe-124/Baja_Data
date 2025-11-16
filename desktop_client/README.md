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
- Raspberry Pi with LoRa HAT and GPS sensor (transmitter side)
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

### During a Session

- **Map Controls**
  - 📍 Center button - Re-center map on car
  - 🔄 Reset button - Clear the track path
  - Double-click map - Set start/finish line location
  - Drag map - Disables auto-centering (click 📍 to re-enable)

- **Lap Timing**
  - Current lap time updates in real-time
  - Delta shows if you're ahead (green) or behind (red) your best lap
  - Lap times table shows all completed laps
  - Best lap is highlighted in blue

- **GPS Status**
  - Fix quality indicator (No Fix / GPS Fix / DGPS / RTK)
  - Satellite count
  - HDOP (accuracy metric)

### Configuration

Settings are automatically saved, including:
- Start/finish line location
- Serial port selection
- Map view preferences

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
