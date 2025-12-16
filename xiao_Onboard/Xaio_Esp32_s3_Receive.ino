#include <SPI.h>
#include <RadioLib.h>


#define LORA_NSS    41
#define LORA_SCK    7
#define LORA_MOSI   9
#define LORA_MISO   8
#define LORA_RST    42
#define LORA_BUSY   40
#define LORA_DIO1   39
#define LORA_ANT_SW 38   // RF switch control

constexpr float   LORA_FREQ_MHZ       = 915.0;
constexpr uint32_t SERIAL_BAUD_RATE   = 115200;
constexpr size_t  COMMAND_BUFFER_LIMIT = 256;
constexpr bool    DEBUG_SERIAL_OUTPUT = false;


Module mod(LORA_NSS, LORA_DIO1, LORA_RST, LORA_BUSY);
SX1262 radio(&mod);

volatile bool loraPacketReady = false;
volatile bool loraInterruptEnabled = true;
String serialCommandBuffer;

#if defined(ESP8266)
ICACHE_RAM_ATTR
#elif defined(ESP32)
IRAM_ATTR
#endif
void onLoRaPacket() {
  if (!loraInterruptEnabled) {
    return;
  }
  loraPacketReady = true;
}

inline void setAntennaRx() {
  digitalWrite(LORA_ANT_SW, LOW);   // LOW = RX mode
}

inline void setAntennaTx() {
  digitalWrite(LORA_ANT_SW, HIGH);  // HIGH = TX mode
}

template <typename T>
void debugLog(const T& msg) {
  if (DEBUG_SERIAL_OUTPUT) {
    Serial.println(msg);
  }
}

void startLoRaReceive() {
  setAntennaRx();
  int state = radio.startReceive();
  if (state != RADIOLIB_ERR_NONE) {
    debugLog(F("radio.startReceive failed"));
    debugLog(state);
  }
}

void transmitCommand(String command) {
  if (command.length() == 0) {
    return;
  }

  loraInterruptEnabled = false;
  loraPacketReady = false;

  setAntennaTx();
  int state = radio.transmit(command);
  setAntennaRx();

  if (state != RADIOLIB_ERR_NONE) {
    debugLog(F("radio.transmit failed"));
    debugLog(state);
  }

  startLoRaReceive();
  loraInterruptEnabled = true;
}

void handleSerialConsole() {
  while (Serial.available() > 0) {
    char incoming = Serial.read();

    if (incoming == '\r') {
      continue;
    }

    if (incoming == '\n') {
      String command = serialCommandBuffer;
      serialCommandBuffer = "";
      command.trim();
      if (command.length() > 0) {
        transmitCommand(command);
      }
      continue;
    }

    if (serialCommandBuffer.length() < COMMAND_BUFFER_LIMIT) {
      serialCommandBuffer += incoming;
    }
  }
}

void pumpLoRaReceive() {
  if (!loraPacketReady) {
    return;
  }

  loraInterruptEnabled = false;
  loraPacketReady = false;

  String incoming;
  int state = radio.readData(incoming);

  if (state == RADIOLIB_ERR_NONE) {
    incoming.trim();
    if (incoming.length() > 0) {
      Serial.println(incoming);
    }
  } else if (state == RADIOLIB_ERR_CRC_MISMATCH) {
    debugLog(F("CRC mismatch"));
  } else {
    debugLog(F("radio.readData failed"));
    debugLog(state);
  }

  startLoRaReceive();
  loraInterruptEnabled = true;
}

void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  while (!Serial);

  pinMode(LORA_ANT_SW, OUTPUT);
  setAntennaRx();

  pinMode(LORA_RST, OUTPUT);
  digitalWrite(LORA_RST, HIGH);

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);

  int state = radio.begin(LORA_FREQ_MHZ);
  if (state != RADIOLIB_ERR_NONE) {
    debugLog(F("LoRa init failed"));
    debugLog(state);
    while (true) {
      delay(100);
    }
  }

  radio.setPacketReceivedAction(onLoRaPacket);

  startLoRaReceive();
  debugLog(F("Receiver ready"));
}

void loop() {
  handleSerialConsole();
  pumpLoRaReceive();
}
