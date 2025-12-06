#include <SPI.h>
#include <RadioLib.h>

// ================================
// Correct B2B Connector Pins (must match TX exactly)
// ================================
#define LORA_NSS    41
#define LORA_SCK    7
#define LORA_MOSI   9
#define LORA_MISO   8
#define LORA_RST    42
#define LORA_BUSY   40
#define LORA_DIO1   39
#define LORA_ANT_SW 38   // RF switch control

// ================================
// Create RadioLib SX1262 module
// ================================
Module mod(LORA_NSS, LORA_DIO1, LORA_RST, LORA_BUSY);
SX1262 radio(&mod);

void setup() {
  Serial.begin(115200);
  while (!Serial);

  Serial.println("=== SX1262 Minimal RX Test ===");

  // ---- Setup pins ----
  pinMode(LORA_ANT_SW, OUTPUT);
  digitalWrite(LORA_ANT_SW, LOW);     // LOW = RX mode (opposite of TX)

  pinMode(LORA_RST, OUTPUT);
  digitalWrite(LORA_RST, HIGH);

  // ---- Start SPI Bus ----
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);

  Serial.println("Initializing LoRa...");

  // ---- Initialize SX1262 ----
  int state = radio.begin(915.0);

  if (state == RADIOLIB_ERR_NONE) {
    Serial.println("LoRa init success!");
  } else {
    Serial.print("LoRa init FAILED, code = ");
    Serial.println(state);
    while (true) delay(100);
  }

  // Put antenna into RX mode
  digitalWrite(LORA_ANT_SW, LOW);

  // Start receive mode
  radio.startReceive();
  Serial.println("Ready to receive!");
}

void loop() {
  String str;
  int state = radio.receive(str);

  if (state == RADIOLIB_ERR_NONE) {
    Serial.println("[RECEIVED]");
    Serial.println(str);

    // Back to RX mode
    digitalWrite(LORA_ANT_SW, LOW);
    radio.startReceive();
  }
}
