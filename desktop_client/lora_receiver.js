/**
 * LoRa Receiver Module
 * 
 * Handles serial communication with the Waveshare USB LoRa module.
 * Receives JSON packets transmitted from the Raspberry Pi and parses telemetry data.
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');

class LoRaReceiver extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.parser = null;
    this.connected = false;
    this.testTransmit = {
      running: false,
      intervalId: null,
      sequence: 0,
      options: {
        frequencyMHz: 915,
        intervalMs: 1000
      }
    };
  }

  /**
   * List all available serial ports
   * @returns {Promise<Array>} Array of port info objects
   */
  async listPorts() {
    try {
      const ports = await SerialPort.list();
      // Filter for likely LoRa devices (Waveshare often uses CH340/CP210x chips)
      return ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer || 'Unknown',
        serialNumber: port.serialNumber || '',
        vendorId: port.vendorId || '',
        productId: port.productId || ''
      }));
    } catch (error) {
      console.error('Error listing serial ports:', error);
      return [];
    }
  }

  /**
   * Connect to a serial port
   * @param {string} portPath - Path to the serial port (e.g., '/dev/ttyUSB0' or 'COM3')
   * @param {number} baudRate - Baud rate (default: 115200 for Waveshare LoRa)
   * @returns {Promise<boolean>} Success status
   */
  async connect(portPath, baudRate = 115200) {
    if (this.connected) {
      await this.disconnect();
    }

    return new Promise((resolve, reject) => {
      try {
        // Create serial port instance
        this.port = new SerialPort({
          path: portPath,
          baudRate: baudRate,
          dataBits: 8,
          parity: 'none',
          stopBits: 1
        });

        // Create a parser to read line-delimited data
        // Assuming packets end with newline (can be adjusted based on actual format)
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

        // Handle incoming data
        this.parser.on('data', (line) => {
          this.handleIncomingData(line);
        });

        // Handle port open event
        this.port.on('open', () => {
          this.connected = true;
          this.emit('status', { connected: true, port: portPath });
          console.log(`Connected to LoRa device on ${portPath}`);
          resolve(true);
        });

        // Handle errors
        this.port.on('error', (err) => {
          console.error('Serial port error:', err);
          this.emit('error', err);
          reject(err);
        });

        // Handle port close
        this.port.on('close', () => {
          this.connected = false;
          this.emit('status', { connected: false, port: null });
          console.log('Serial port closed');
        });

      } catch (error) {
        console.error('Error connecting to serial port:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the serial port
   * @returns {Promise<boolean>} Success status
   */
  async disconnect() {
    this.stopTestTransmit();
    return new Promise((resolve) => {
      if (this.port && this.port.isOpen) {
        this.port.close((err) => {
          if (err) {
            console.error('Error closing port:', err);
          }
          this.connected = false;
          this.port = null;
          this.parser = null;
          resolve(true);
        });
      } else {
        resolve(true);
      }
    });
  }

  /**
   * Parse and handle incoming data from the LoRa receiver
   * Expected format: JSON string like {"ts":"2025-11-13T12:34:56Z","lat":37.7749,"lon":-122.4194,...}
   * @param {string} line - Raw line of data from serial port
   */
  handleIncomingData(line) {
    try {
      // Trim whitespace
      line = line.trim();
      if (!line) return;

      // Try to parse as JSON
      const data = JSON.parse(line);

      // Validate required fields
      if (data.lat !== undefined && data.lon !== undefined) {
        // Create standardized telemetry object
        const telemetry = {
          timestamp: data.ts || new Date().toISOString(),
          latitude: data.lat,
          longitude: data.lon,
          altitude: data.alt || 0,
          fix: data.fix || 0,
          satellites: data.sats || 0,
          hdop: data.hdop || 0,
          imu: data.imu || null,
          raw: data
        };

        // Emit the telemetry data to listeners
        this.emit('data', telemetry);
      } else {
        console.warn('Received incomplete GPS data:', data);
      }
    } catch (error) {
      // Not valid JSON or parsing error - log but don't crash
      console.warn('Failed to parse incoming data:', line, error.message);
    }
  }

  getTestTransmitStatus() {
    return {
      running: this.testTransmit.running,
      frequencyMHz: this.testTransmit.options.frequencyMHz,
      intervalMs: this.testTransmit.options.intervalMs
    };
  }

  startTestTransmit(options = {}) {
    if (!this.port || !this.connected || !this.port.isOpen) {
      throw new Error('Connect to a LoRa receiver before sending test packets.');
    }

    if (this.testTransmit.running) {
      return this.getTestTransmitStatus();
    }

    const frequencyMHz = Number(options.frequencyMHz) || this.testTransmit.options.frequencyMHz || 915;
    const requestedInterval = Number(options.intervalMs) || this.testTransmit.options.intervalMs || 1000;
    const intervalMs = Math.max(200, requestedInterval);

    this.testTransmit.options = { frequencyMHz, intervalMs };
    this.testTransmit.sequence = 0;

    const sendPacket = () => {
      try {
        const payload = this.buildTestTelemetryPacket(frequencyMHz);
        this.writeTestPayload(payload);
      } catch (error) {
        console.error('Failed to send test telemetry:', error);
      }
    };

    sendPacket();
    this.testTransmit.intervalId = setInterval(sendPacket, intervalMs);
    this.testTransmit.running = true;

    const status = this.getTestTransmitStatus();
    this.emit('test-status', status);
    return status;
  }

  stopTestTransmit() {
    if (this.testTransmit.intervalId) {
      clearInterval(this.testTransmit.intervalId);
      this.testTransmit.intervalId = null;
    }

    if (this.testTransmit.running) {
      this.testTransmit.running = false;
      const status = this.getTestTransmitStatus();
      this.emit('test-status', status);
      return status;
    }

    return this.getTestTransmitStatus();
  }

  buildTestTelemetryPacket(frequencyMHz) {
    const seq = this.testTransmit.sequence++;
    const baseLat = 40.391234;
    const baseLon = -88.221234;
    const radius = 0.0008;
    const angle = (seq % 360) * (Math.PI / 180);

    return {
      ts: new Date().toISOString(),
      lat: baseLat + Math.sin(angle) * radius,
      lon: baseLon + Math.cos(angle) * radius,
      alt: 12 + (seq % 8),
      fix: 3,
      sats: 10 + (seq % 4),
      hdop: 0.8,
      test: true,
      source: 'desktop-test',
      freq_mhz: frequencyMHz,
      sequence: seq
    };
  }

  writeTestPayload(payload) {
    if (!this.port || !this.port.isOpen) {
      throw new Error('Serial port is not open for test transmit.');
    }

    const serialized = JSON.stringify(payload);
    this.port.write(serialized + '\n', (err) => {
      if (err) {
        console.error('Failed to write test payload:', err);
      }
    });
  }

  /**
   * Send an arbitrary command string to the connected LoRa/ESP32 device
   * @param {string} command
   * @returns {Promise<boolean>}
   */
  sendCommand(command) {
    if (!this.port || !this.connected || !this.port.isOpen) {
      throw new Error('Connect to a LoRa receiver before sending commands.');
    }

    const line = typeof command === 'string' ? command : String(command ?? '');
    const payload = line.trimEnd() + '\n';

    return new Promise((resolve, reject) => {
      this.port.write(payload, (err) => {
        if (err) {
          console.error('Failed to write command:', err);
          reject(err);
        } else {
          this.port.drain((drainErr) => {
            if (drainErr) {
              console.error('Failed to drain command:', drainErr);
              reject(drainErr);
            } else {
              resolve(true);
            }
          });
        }
      });
    });
  }

  /**
   * Close the receiver and clean up resources
   */
  close() {
    this.disconnect();
  }
}

module.exports = LoRaReceiver;
