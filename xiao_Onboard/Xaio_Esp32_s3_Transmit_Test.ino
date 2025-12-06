#include <SPI.h>
#include <RadioLib.h>

// ================================
// Correct B2B Connector Pins
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
  while(!Serial);

  Serial.println("=== SX1262 Minimal TX Test ===");

  // ---- Setup pins ----
  pinMode(LORA_ANT_SW, OUTPUT);
  digitalWrite(LORA_ANT_SW, HIGH);     // HIGH = TX mode on many Seeed boards

  pinMode(LORA_RST, OUTPUT);
  digitalWrite(LORA_RST, HIGH);

  // ---- Start SPI Bus ----
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);

  Serial.println("Initializing LoRa...");

  // ---- Initialize SX1262 with SAFE minimal parameters ----
  int state = radio.begin(915.0);     // US frequency, change if needed

  if (state == RADIOLIB_ERR_NONE) {
    Serial.println("LoRa init success!");
  } else {
    Serial.print("LoRa init FAILED, code = ");
    Serial.println(state);
    while (true) delay(100);
  }

  // ---- Set TX Power ----  
  radio.setOutputPower(22);

  Serial.println("Ready to transmit!");
}

void loop() {
  Serial.println("Sending LoRa packet...");

  // ---- REQUIRED: enable antenna switch before TX ----
  digitalWrite(LORA_ANT_SW, HIGH);

  int state = radio.transmit("Hello from ESP32S3!");

  if (state == RADIOLIB_ERR_NONE) {
    Serial.println("Transmission OK!");
  } else {
    Serial.print("Transmit FAILED, code = ");
    Serial.println(state);
  }

  delay(5000);
}
