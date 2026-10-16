import network
import urequests
import ujson
import time
from machine import Pin, time_pulse_us

# ============================================================
# ESTACIÓN DE AUTOCOBRO IOT - FIRMWARE ESP32 (MicroPython)
# ------------------------------------------------------------
# Universidad Católica Boliviana "San Pablo" - IoT
# Transmite eventos de sensores hacia la tabla 'sensor_readings'
# de Supabase para alimentar el flujo de Autocobro y Dashboard.
# ============================================================

WIFI_SSID = "Wokwi-GUEST"
WIFI_PASS = ""
# Reemplazar con la URL y API Key de tu proyecto en Supabase:
SUPABASE_URL = "https://TU_PROYECTO.supabase.co"
SUPABASE_KEY = "TU_ANON_KEY_PUBLIC"
DEVICE_ID = "CAJA_IOT_01"

# Mapeo de Pines GPIO del ESP32
LED_ESTADO = Pin(13, Pin.OUT)   # LED de estado Wi-Fi (GPIO 13)
BUZZER     = Pin(15, Pin.OUT)   # Zumbador piezoeléctrico de confirmación (GPIO 15)
TRIG_PIN   = Pin(17, Pin.OUT)   # HC-SR04 Trigger (Proximidad/Presencia)
ECHO_PIN   = Pin(2, Pin.IN)     # HC-SR04 Echo


def conectar_wifi():
    """Gestiona la conexión y reconexión automática a la red Wi-Fi."""
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)

    if wlan.isconnected():
        LED_ESTADO.value(1)
        print("[Wi-Fi] Ya conectado. IP:", wlan.ifconfig()[0])
        return True

    print("[Wi-Fi] Conectando a la red:", WIFI_SSID)
    try:
        wlan.connect(WIFI_SSID, WIFI_PASS)
        intentos = 0
        while not wlan.isconnected() and intentos < 20:
            LED_ESTADO.value(not LED_ESTADO.value())
            time.sleep(0.5)
            intentos += 1
    except Exception as e:
        print("[Wi-Fi] Excepción durante la conexión:", e)

    if wlan.isconnected():
        LED_ESTADO.value(1)
        print("[Wi-Fi] Conectado exitosamente. IP:", wlan.ifconfig()[0])
        return True

    LED_ESTADO.value(0)
    print("[Wi-Fi] Error de conexión. Se reintentará en el próximo ciclo.")
    return False


def emitir_beep(duracion=0.1):
    """Genera una alerta sonora corta al registrar un evento en la estación."""
    try:
        BUZZER.value(1)
        time.sleep(duracion)
        BUZZER.value(0)
    except Exception:
        pass


def leer_distancia_ultrasonido():
    """Lee el sensor HC-SR04 (presencia/retiro de artículos); valor por defecto si falla."""
    try:
        TRIG_PIN.value(0)
        time.sleep_us(2)
        TRIG_PIN.value(1)
        time.sleep_us(10)
        TRIG_PIN.value(0)
        duracion = time_pulse_us(ECHO_PIN, 1, 30000)
        if duracion > 0:
            return round((duracion / 2) / 29.1, 2)
    except Exception as e:
        print("[HC-SR04] Error de lectura:", e)
    return 12.5  # Valor simulado en cm


def enviar_sensor_reading(sensor_type, numeric_value=0.0, rfid_uid=None, metadata=None):
    """
    Envía una lectura individual a la tabla 'sensor_readings' vía Supabase REST API (HTTP POST).
    Tipos soportados:
      - 'rc522'      : Detección de tag RFID de producto escaneado.
      - 'hx711'      : Peso medido en gramos en la bandeja de pesaje anti-fraude.
      - 'proximidad' : Detección de presencia o retiro de productos de la estación.
    """
    clean_url = SUPABASE_URL.rstrip("/").replace("/rest/v1", "")
    url = "{}/rest/v1/sensor_readings".format(clean_url)

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    payload = {
        "device_id": DEVICE_ID,
        "sensor_type": sensor_type,
        "numeric_value": float(numeric_value),
        "rfid_uid": rfid_uid,
        "metadata": metadata if metadata else {},
    }

    try:
        res = urequests.post(url, headers=headers, data=ujson.dumps(payload))
        if res.status_code in (200, 201, 204):
            print("[Supabase] Lectura enviada -> {} | val: {} | uid: {}".format(sensor_type, numeric_value, rfid_uid))
            emitir_beep()
        else:
            print("[Supabase] Error HTTP:", res.status_code, res.text)
        res.close()
    except Exception as e:
        print("[Supabase] Excepción en envío HTTP:", e)


# ============================================================
# BUCLE PRINCIPAL DE EJECUCIÓN (MAIN LOOP)
# ============================================================
conectar_wifi()

# Datos de muestra para modo demostración / exposición
codigos_demo = ["TAG_LECHE_1L", "TAG_PAN_500G", "TAG_GALLETAS", "TAG_JUGO_1L"]
pesos_demo = [1025.0, 510.0, 210.0, 1060.0]
indice = 0

print("=== ESTACIÓN DE AUTOCOBRO IOT INICIADA (ESP32) ===")

while True:
    try:
        # 1. Asegurar conectividad Wi-Fi antes de transmitir
        wlan = network.WLAN(network.STA_IF)
        if not wlan.isconnected():
            conectar_wifi()

        if wlan.isconnected():
            tag_actual = codigos_demo[indice % len(codigos_demo)]
            peso_actual = pesos_demo[indice % len(pesos_demo)]
            distancia_actual = leer_distancia_ultrasonido()

            # Transmisión secuencial simulando la interacción del cliente:
            # A) Evento RFID RC522: producto escaneado
            enviar_sensor_reading("rc522", numeric_value=0.0, rfid_uid=tag_actual, metadata={"source": "RC522_SPI"})
            time.sleep(1)

            # B) Evento Balanza HX711: producto colocado en la balanza
            enviar_sensor_reading("hx711", numeric_value=peso_actual, rfid_uid=None, metadata={"unit": "g"})
            time.sleep(1)

            # C) Evento Ultrasonido/Proximidad: cliente frente a la estación
            enviar_sensor_reading("proximidad", numeric_value=distancia_actual, rfid_uid=None, metadata={"dist_cm": distancia_actual})

            indice += 1

        time.sleep(5)  # Intervalo de 5 segundos entre ciclos de demostración

    except Exception as err:
        print("[Sistema] Error en el ciclo principal:", err)
        time.sleep(2)
