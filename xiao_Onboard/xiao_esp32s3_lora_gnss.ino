#include <Arduino.h>
#include <SPI.h>
#include <RadioLib.h>
#include <TinyGPSPlus.h>
#include <math.h>

// -----------------------------------------------------------------------------
// Hardware configuration (matches the wiring table in README.md)
// -----------------------------------------------------------------------------
constexpr uint8_t LORA_SCK  = 7;   // SPI clock
constexpr uint8_t LORA_MISO = 8;   // SPI MISO
constexpr uint8_t LORA_MOSI = 9;   // SPI MOSI
constexpr uint8_t LORA_NSS  = 41;  // SX1262 chip select
constexpr uint8_t LORA_RST  = 42;  // SX1262 reset
constexpr uint8_t LORA_BUSY = 40;  // SX1262 busy line
constexpr uint8_t LORA_DIO1 = 39;  // SX1262 DIO1 interrupt
constexpr int8_t  LORA_RXEN = 2;   // RF switch RX enable (set to -1 if unused)
constexpr int8_t  LORA_TXEN = 1;   // RF switch TX enable (set to -1 if unused)
constexpr int8_t  LORA_ANT_SW = 38;  // Optional aux RF switch / ANT control, -1 to disable

constexpr uint8_t GNSS_RX_PIN = 44;     // ESP32S3 RX listening to L76K TX
constexpr uint8_t GNSS_TX_PIN = 43;     // ESP32S3 TX feeding L76K RX (optional)
constexpr int8_t  GNSS_PPS_PIN = 3;     // 1PPS pulse input, set to -1 to disable
constexpr uint32_t GNSS_BAUD = 9600;

constexpr uint8_t STATUS_LED_PIN = LED_BUILTIN;

// -----------------------------------------------------------------------------
// LoRa modem knobs (safe regional defaults, tweak to taste)
// -----------------------------------------------------------------------------
constexpr float    LORA_FREQUENCY_MHZ   = 915.0F;  // Change per region
constexpr float    LORA_BANDWIDTH_KHZ   = 125.0F;
constexpr uint8_t  LORA_SPREADING_FACTOR = 9;      // 5..12
constexpr uint8_t  LORA_CODING_RATE      = 7;      // 5..8 -> 4/5 .. 4/8
constexpr uint8_t  LORA_PREAMBLE_SYMB    = 10;
constexpr uint8_t  LORA_SYNC_WORD        = 0x12;
constexpr int8_t   LORA_TX_POWER_DBM     = 17;     // 2..22 (SX1262)
constexpr float    LORA_CURRENT_LIMIT_MA = 120.0F;

constexpr uint32_t TELEMETRY_INTERVAL_MS = 5000UL;
constexpr uint32_t MAX_FIX_AGE_MS = 15000UL;
constexpr uint8_t  REQUIRE_MIN_SATS = 4;

constexpr size_t   PAYLOAD_CAPACITY = 196;         // generous buffer for JSON payload

// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------
SPIClass loraSPI(FSPI);
SX1262 radio = new Module(LORA_NSS, LORA_DIO1, LORA_RST, LORA_BUSY, loraSPI);
TinyGPSPlus gps;
HardwareSerial& GNSS_SERIAL = Serial1;

volatile bool ppsFlag = false;
uint32_t ledPulseDeadlineMs = 0;
uint32_t lastTelemetryMs = 0;
uint32_t lastStatusPrintMs = 0;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
void IRAM_ATTR handlePps() {
  ppsFlag = true;
}

void logError(const __FlashStringHelper* stage, int16_t code) {
  Serial.print(F("[SX1262] "));
  Serial.print(stage);
  Serial.print(F(" failed, code "));
  Serial.println(code);
}

bool configureRadio() {
  Serial.println(F("[SX1262] Booting radio..."));

  int16_t state = radio.begin();
  if (state != RADIOLIB_ERR_NONE) {
    logError(F("begin"), state);
    return false;
  }

  state |= radio.setFrequency(LORA_FREQUENCY_MHZ);
  state |= radio.setBandwidth(LORA_BANDWIDTH_KHZ);
  state |= radio.setSpreadingFactor(LORA_SPREADING_FACTOR);
  state |= radio.setCodingRate(LORA_CODING_RATE);
  state |= radio.setPreambleLength(LORA_PREAMBLE_SYMB);
  state |= radio.setSyncWord(LORA_SYNC_WORD);
  state |= radio.setOutputPower(LORA_TX_POWER_DBM);
  state |= radio.setCurrentLimit(LORA_CURRENT_LIMIT_MA);
  state |= radio.setCRC(true);

  if (state != RADIOLIB_ERR_NONE) {
    logError(F("param"), state);
    return false;
  }

  if (LORA_RXEN >= 0 || LORA_TXEN >= 0 || LORA_ANT_SW >= 0) {
    const int8_t rx = (LORA_RXEN >= 0) ? LORA_RXEN : RADIOLIB_NC;
    const int8_t tx = (LORA_TXEN >= 0) ? LORA_TXEN : RADIOLIB_NC;
    const int8_t aux = (LORA_ANT_SW >= 0) ? LORA_ANT_SW : RADIOLIB_NC;
    radio.setRfSwitchPins(rx, tx, aux);
  }

  // Put radio into standby between packets.
  radio.standby();

  Serial.println(F("[SX1262] Ready"));
  return true;
}

void pumpGnss() {
  while (GNSS_SERIAL.available() > 0) {
    gps.encode(GNSS_SERIAL.read());
  }
}

bool hasFreshFix() {
  if (!gps.location.isValid()) {
    return false;
  }
  const uint32_t age = gps.location.age();
  if (age == TinyGPSPlus::GPS_INVALID_AGE || age > MAX_FIX_AGE_MS) {
    return false;
  }
  if (gps.satellites.isValid() && gps.satellites.value() < REQUIRE_MIN_SATS) {
    return false;
  }
  return true;
}

bool buildPayload(char* outBuffer, size_t capacity) {
  const bool fixOk = hasFreshFix();
  const uint32_t fixAge = gps.location.age();
  const uint32_t sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
  const double hdop = gps.hdop.isValid() ? gps.hdop.hdop() : NAN;
  const double altitude = gps.altitude.isValid() ? gps.altitude.meters() : NAN;
  const double speed = gps.speed.isValid() ? gps.speed.kmph() : NAN;
  const double course = gps.course.isValid() ? gps.course.deg() : NAN;

  if (fixOk) {
    const double lat = gps.location.lat();
    const double lon = gps.location.lng();
    int written = snprintf(
      outBuffer,
      capacity,
      "{\"fix\":1,\"sats\":%lu,\"age\":%lu,\"lat\":%.6f,\"lon\":%.6f,\"alt\":%.1f,\"hdop\":%.1f,\"spd\":%.2f,\"cog\":%.1f}",
      static_cast<unsigned long>(sats),
      static_cast<unsigned long>(fixAge),
      lat,
      lon,
      altitude,
      hdop,
      speed,
      course
    );
    return (written > 0) && (static_cast<size_t>(written) < capacity);
  }

  int written = snprintf(
    outBuffer,
    capacity,
    "{\"fix\":0,\"sats\":%lu,\"age\":%lu,\"hdop\":%.1f}",
    static_cast<unsigned long>(sats),
    static_cast<unsigned long>(fixAge == TinyGPSPlus::GPS_INVALID_AGE ? 0UL : fixAge),
    hdop
  );
  return (written > 0) && (static_cast<size_t>(written) < capacity);
}

void pulseStatusLed() {
  if (ppsFlag) {
    ppsFlag = false;
    digitalWrite(STATUS_LED_PIN, HIGH);
    ledPulseDeadlineMs = millis() + 50;  // 50 ms pulse on each PPS rising edge
  }

  if (ledPulseDeadlineMs != 0 && millis() > ledPulseDeadlineMs) {
    digitalWrite(STATUS_LED_PIN, LOW);
    ledPulseDeadlineMs = 0;
  }
}

void blinkStatusFallback(bool fixOk) {
  static uint32_t lastToggle = 0;
  static bool ledOn = false;
  const uint32_t interval = fixOk ? 250 : 1000;

  if (millis() - lastToggle >= interval) {
    ledOn = !ledOn;
    digitalWrite(STATUS_LED_PIN, ledOn);
    lastToggle = millis();
  }
}

void printGnssStatus() {
  if (millis() - lastStatusPrintMs < 2000UL) {
    return;
  }
  lastStatusPrintMs = millis();

  const bool fixOk = hasFreshFix();
  const uint32_t sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
  const double hdop = gps.hdop.isValid() ? gps.hdop.hdop() : NAN;
  const double lat = gps.location.isValid() ? gps.location.lat() : NAN;
  const double lon = gps.location.isValid() ? gps.location.lng() : NAN;

  Serial.print(F("[GNSS] fix="));
  Serial.print(fixOk ? F("OK") : F("--"));
  Serial.print(F(" sats="));
  Serial.print(sats);
  Serial.print(F(" hdop="));
  if (isnan(hdop)) {
    Serial.print(F("nan"));
  } else {
    Serial.print(hdop, 1);
  }
  Serial.print(F(" lat="));
  if (isnan(lat)) {
    Serial.print(F("--"));
  } else {
    Serial.print(lat, 6);
  }
  Serial.print(F(" lon="));
  if (isnan(lon)) {
    Serial.print(F("--"));
  } else {
    Serial.print(lon, 6);
  }
  Serial.println();
}

bool sendPayload(const char* payload) {
  const size_t len = strlen(payload);
  Serial.print(F("[LoRa] TX "));
  Serial.print(len);
  Serial.print(F(" bytes: "));
  Serial.println(payload);

  int16_t state = radio.transmit(payload);
  if (state == RADIOLIB_ERR_NONE) {
    uint32_t toa = radio.getTimeOnAir(len);
    Serial.print(F("[LoRa] TX done ("));
    Serial.print(static_cast<unsigned long>(toa));
    Serial.println(F(" ms on-air)"));
    return true;
  }

  logError(F("transmit"), state);
  return false;
}

// -----------------------------------------------------------------------------
// Arduino entry points
// -----------------------------------------------------------------------------
void setup() {
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.begin(115200);
  while (!Serial && millis() < 4000) {
    delay(10);
  }

  Serial.println();
  Serial.println(F("XIAO ESP32S3 + Wio-SX1262 + L76K GNSS"));

  GNSS_SERIAL.begin(GNSS_BAUD, SERIAL_8N1, GNSS_RX_PIN, GNSS_TX_PIN);
  Serial.print(F("[GNSS] Serial1 @"));
  Serial.print(GNSS_BAUD);
  Serial.print(F(" bps on GPIO"));
  Serial.print(GNSS_RX_PIN);
  Serial.print(F("<-TX / GPIO"));
  Serial.print(GNSS_TX_PIN);
  Serial.println(F("->RX"));

  if (GNSS_PPS_PIN >= 0) {
    pinMode(GNSS_PPS_PIN, INPUT_PULLDOWN);
    attachInterrupt(GNSS_PPS_PIN, handlePps, RISING);
    Serial.print(F("[GNSS] PPS on GPIO"));
    Serial.println(GNSS_PPS_PIN);
  }

  loraSPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);

  if (!configureRadio()) {
    Serial.println(F("[HALT] Unable to start radio. Check wiring."));
    while (true) {
      delay(1000);
    }
  }
}

void loop() {
  pumpGnss();
  printGnssStatus();

  if (GNSS_PPS_PIN >= 0) {
    pulseStatusLed();
  } else {
    blinkStatusFallback(hasFreshFix());
  }

  const uint32_t now = millis();
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    char payload[PAYLOAD_CAPACITY] = {0};

    if (!buildPayload(payload, sizeof(payload))) {
      Serial.println(F("[LoRa] Payload truncated, skipping"));
      continue;
    }

    if (!sendPayload(payload)) {
      Serial.println(F("[LoRa] Send failed, will retry next interval"));
    }
  }
}
