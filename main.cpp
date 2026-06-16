#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include "secrets.h"

#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(WIFI1_SSID, WIFI1_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi Connected!");
}

void loop() {
  delay(2000);
  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (!isnan(h) && !isnan(t)) {
    HTTPClient http;
    http.begin(String(SUPABASE_URL) + "/rest/v1/vitals");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("apikey", SUPABASE_KEY);
    http.addHeader("Authorization", "Bearer " + String(SUPABASE_KEY));

   // Change this line in your main.cpp to match what your table requires
   // This updates the names to match what your Dashboard is looking for
    // Change the labels to match the dashboard's requirements
    // This labels the data so the dashboard can find it
    // Ensure these keys match the VITAL_TYPES keys in the code you just shared
    String json = "{\"device_id\":\"IoMT-Node01\", \"body_temp\":" + String(t) + ", \"heart_rate\":" + String(h) + "}";
    int httpCode = http.POST(json);
    Serial.print("Status: "); Serial.println(httpCode);
    http.end();
  }
  delay(10000);
}