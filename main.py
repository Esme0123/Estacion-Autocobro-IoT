import network
import urequests
import ujson
import time
from machine import Pin, SPI, time_pulse_us

# ============================================================
# CONFIGURACIÓN DE RED Y SUPABASE (REEMPLAZA CON TUS DATOS)
# ============================================================
WIFI_SSID = "TU_RED_WIFI"
WIFI_PASS = "TU_PASSWORD"
SUPABASE_URL = "https://tu-proyecto.supabase.co"
SUPABASE_KEY = "tu_anon_key_aqui"

# Configuración de Pines GPIO ESP32
LED_WIFI = Pin(2, Pin.OUT)      # LED integrado ESP32
BUZZER = Pin(15, Pin.OUT)       # Zumbador
TRIG_PIN = Pin(17, Pin.OUT)     # HC-SR04 Trigger
ECHO_PIN = Pin(2, Pin.IN)       # HC-SR04 Echo

def conectar_wifi():
    """Gestiona la conexión y reconexión automática a Wi-Fi"""
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        print("[Wi-Fi] Conectando a la red:", WIFI_SSID)
        wlan.connect(WIFI_SSID, WIFI_PASS)
        intentos = 0
        while not wlan.isconnected() and intentos < 15:
            LED_WIFI.value(not LED_WIFI.value())
            time.sleep(0.5)
            intentos += 1
            
    if wlan.isconnected():
        LED_WIFI.value(1)
        print("[Wi-Fi] Conectado exitosamente! IP:", wlan.ifconfig()[0])
    else:
        LED_WIFI.value(0)
        print("[Wi-Fi] Error de conexión Wi-Fi")

def emitir_beep():
    """Genera una alerta sonora corta al procesar una lectura"""
    try:
        BUZZER.value(1)
        time.sleep(0.1)
        BUZZER.value(0)
    except:
        pass

def leer_distancia_ultrasonido():
    """Lee el sensor HC-SR04; si no está conectado retorna valor simulado"""
    try:
        TRIG_PIN.value(0)
        time.sleep_us(2)
        TRIG_PIN.value(1)
        time.sleep_us(10)
        TRIG_PIN.value(0)
        duracion = time_pulse_us(ECHO_PIN, 1, 30000)
        if duracion > 0:
            return round((duracion / 2) / 29.1, 2)
    except:
        pass
    return 12.5 # Valor por defecto / simulado en cm

def enviar_telemetria_supabase(codigo, peso, distancia):
    """Envía la lectura de la estación a la tabla lecturas_iot vía REST API"""
    url = f"{SUPABASE_URL}/rest/v1/lecturas_iot"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    payload = {
        "codigo_escaneado": codigo,
        "peso_medido_g": peso,
        "distancia_cm": distancia,
        "estado_validacion": "CORRECTO" if peso > 0 else "ERROR_PESO"
    }
    
    try:
        res = urequests.post(url, headers=headers, data=ujson.dumps(payload))
        if res.status_code in [200, 201]:
            print(f"[Supabase] Registro enviado con éxito -> {codigo} | {peso}g")
            emitir_beep()
        else:
            print("[Supabase] Error HTTP:", res.status_code)
        res.close()
    except Exception as e:
        print("[Supabase] Excepción en envío HTTP:", e)

# ============================================================
# BUCLE PRINCIPAL DE EJECUCIÓN (MAIN LOOP)
# ============================================================
conectar_wifi()

# Datos de muestra para modo demostración / exposición
codigos_demo = ["TAG_LECHE_1L", "TAG_PAN_500G", "TAG_GALLETAS"]
pesos_demo = [1025.0, 510.0, 210.0]
indice = 0

print("=== ESTACIÓN DE AUTOCOBRO IOT INICIADA ===")

while True:
    try:
        # Asegurar conectividad
        wlan = network.WLAN(network.STA_IF)
        if not wlan.isconnected():
            conectar_wifi()
            
        # 1. Obtener Lecturas de Sensores
        distancia = leer_distancia_ultrasonido()
        codigo_actual = codigos_demo[indice % len(codigos_demo)]
        peso_actual = pesos_demo[indice % len(pesos_demo)]
        
        # 2. Transmitir a la Nube
        enviar_telemetria_supabase(codigo_actual, peso_actual, distancia)
        
        indice += 1
        time.sleep(5) # Envío cada 5 segundos
        
    except Exception as err:
        print("[Sistema] Error en ciclo principal:", err)
        time.sleep(2)