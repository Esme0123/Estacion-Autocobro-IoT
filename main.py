import network
import urequests
import ujson
import time
from machine import Pin, time_pulse_us

# ============================================================
# CONFIGURACIÓN DE RED Y SUPABASE
# ------------------------------------------------------------
# Para el simulador Wokwi usar la red virtual "Wokwi-GUEST".
# Reemplaza SUPABASE_URL y SUPABASE_KEY con las credenciales
# reales de tu proyecto (se dejaron como placeholders por
# ciberseguridad) y el ESTACION_ID con el id de tu estación.
# ============================================================
WIFI_SSID = "Wokwi-GUEST"
WIFI_PASS = ""
SUPABASE_URL = "https://TU_PROYECTO.supabase.co"
SUPABASE_KEY = "TU_ANON_KEY_PUBLIC"
ESTACION_ID = 1  # id de 'CAJA_IOT_01' en la tabla estaciones_autocobro

# Configuración de pines GPIO del ESP32
LED_ESTADO = Pin(13, Pin.OUT)   # LED de estado Wi-Fi (GPIO 13)
BUZZER     = Pin(15, Pin.OUT)   # Zumbador piezoeléctrico
TRIG_PIN   = Pin(17, Pin.OUT)   # HC-SR04 Trigger
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
    """Genera una alerta sonora corta al procesar una lectura."""
    try:
        BUZZER.value(1)
        time.sleep(duracion)
        BUZZER.value(0)
    except Exception:
        pass


def leer_distancia_ultrasonido():
    """Lee el sensor HC-SR04; retorna un valor simulado si falla."""
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
    return 12.5  # Valor por defecto / simulado en cm


def enviar_telemetria_supabase(codigo, peso, distancia):
    """Envía una lectura a la tabla 'lecturas_iot' vía REST API (HTTP POST)."""
    url = "{}/rest/v1/lecturas_iot".format(SUPABASE_URL)
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {
        "estacion_id": ESTACION_ID,
        "codigo_escaneado": codigo,
        "peso_medido_g": peso,
        "distancia_cm": distancia,
        "estado_validacion": "CORRECTO" if peso > 0 else "ERROR_PESO",
    }

    try:
        res = urequests.post(url, headers=headers, data=ujson.dumps(payload))
        if res.status_code in (200, 201, 204):
            print("[Supabase] Registro enviado -> {} | {} g".format(codigo, peso))
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

print("=== ESTACIÓN DE AUTOCOBRO IOT INICIADA ===")

while True:
    try:
        # 1. Asegurar conectividad Wi-Fi antes de transmitir
        wlan = network.WLAN(network.STA_IF)
        if not wlan.isconnected():
            conectar_wifi()

        # 2. Obtener lecturas de los sensores
        distancia = leer_distancia_ultrasonido()
        codigo_actual = codigos_demo[indice % len(codigos_demo)]
        peso_actual = pesos_demo[indice % len(pesos_demo)]

        # 3. Transmitir a la nube (Supabase)
        if wlan.isconnected():
            enviar_telemetria_supabase(codigo_actual, peso_actual, distancia)
        else:
            print("[Sistema] Sin conexión: lectura no enviada.")

        indice += 1
        time.sleep(5)  # Envío cada 5 segundos

    except Exception as err:
        print("[Sistema] Error en el ciclo principal:", err)
        time.sleep(2)
