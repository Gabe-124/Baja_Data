# ESP32-S3 LoRa GPS Link

Two ESP32-S3 boards exchange GPS telemetry over 915 MHz LoRa for the Baja car. One board transmits real or test GPS points and the other receives and forwards to the desktop dashboard over usb serial. 

## Questions
If you have quesitons, email me at gayan@stevens.edu

## Files
- `Xaio_Esp32_s3_Transmit.ino` — sends GPS data 
- `Xaio_Esp32_s3_Receive.ino` — listens for LoRa packets and prints them to Serial for the dashboard bridge.

## Hardware
- Xaio_ESP32-S3 + SX1262 (LoRa) at 915 MHz
- GPS module on a UART 

## Commands (TX side) 
- `GPS_TEST` — start sending test points (default on boot)
- `GPS_STOP` — stop test points
- `GPS_ON` / `GPS_OFF` — enable/disable live GPS polling/transmit
- `PING` — quick link check
- `LED_ON` / `LED_OFF` — toggle onboard LED
- `REBOOT` — restart the transmitter

## Dashboard bridge
The desktop Electron app listens to the receiver’s serial output and renders the live map, laps, and penalties. 

## AI use disclosure
AI (ChatGPT) was used to format the GPS test point list. Telemetry, LoRa, and integration code were coded by me. The desktop app used AI assistance during development(because my code that was only written by me for that app is scattered, it shouldn't be considered apart of my 250 lines. Please just consider the two Arduino files as my 250 lines for this assignment).

