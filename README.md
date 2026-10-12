# 🛒 Estación de Autocobro Inteligente basada en IoT (Self-Checkout)

> **Universidad Católica Boliviana "San Pablo"**  
> **Carrera:** Ingeniería de Sistemas  
> **Asignatura:** Internet de las Cosas (IoT)  
> **Docente:** Ing. Pamela Valenzuela  
> **Semestre:** 2026  

---

## 👥 Integrantes del Grupo
* Medina Paredes Esmeralda Paula
* Mollinedo Davila Alina
* Osorio Mamani Raquel
* Yahuita Lazarte Luciana Cecilia

---

## 📌 Descripción del Proyecto
El proyecto consiste en el desarrollo de un prototipo de **Estación de Autocobro Inteligente (Self-Checkout)** apoyado en el paradigma de Internet de las Cosas (IoT). La solución permite:
1. Identificar artículos por radiofrecuencia mediante un lector **RFID RC522**.
2. Validar el peso del producto escaneado mediante una celda de carga con amplificador **HX711** para prevención de fraudes en la zona de embolsado.
3. Detectar la presencia del cliente con un sensor ultrasónico **HC-SR04**.
4. Emitir confirmaciones sonoras a través de un **Buzzer piezoeléctrico**.
5. Transmitir la telemetría en tiempo real mediante API REST HTTPS desde un microcontrolador **ESP32** programado en **MicroPython** hacia una base de datos en la nube (**Supabase - PostgreSQL**).
6. Visualizar las transacciones en vivo desde un **Dashboard Web** responsivo con gráficos dinámicos (Chart.js) y autenticación de usuarios.

---

## 🏗️ Arquitectura del Sistema IoT

┌─────────────────┐       Wi-Fi / REST API      ┌──────────────────┐
│  Nodo IoT ESP32 ├────────────────────────────►│  Nube Supabase   │
│ (MicroPython)   │    POST /lecturas_iot       │   (PostgreSQL)   │
└────────┬────────┘                             └────────┬─────────┘
│                                               │
[RFID / Peso / IR]                             [Realtime / GET]
│
┌────────▼─────────┐
│  Dashboard Web   │
│ (HTML/CSS/JS)    │
└──────────────────┘


---

## 🛠️ Hardware y Mapeo de Pines (Pinout ESP32)

| Componente / Sensor | Pin Módulo | Pin Conectado en ESP32 | Alimentación |
| :--- | :--- | :--- | :--- |
| **Lector RFID RC522** | SDA, SCK, MOSI, MISO | GPIO 5, GPIO 18, GPIO 23, GPIO 19 | 3.3V / GND |
| **Módulo HX711 (Peso)** | DT (Data), SCK (Clock) | GPIO 16, GPIO 4 | 5V (VIN) / GND |
| **Sensor HC-SR04** | Trig, Echo | GPIO 17, GPIO 2 | 5V (VIN) / GND |
| **Buzzer** | Signal (+) | GPIO 15 | GND |

---

## 📂 Estructura del Repositorio

* **`schema.sql`**: Script completo con las 6 tablas relacionales, llaves foráneas, datos de prueba y políticas Row Level Security (RLS) en PostgreSQL/Supabase.
* **`main.py`**: Firmware en MicroPython para el ESP32 con gestión de conexión Wi-Fi, lectura de sensores, tolerancia a fallas y envío HTTP REST.
* **`index.html`**: Interfaz de usuario (Dashboard Web) estilizada con paleta pastel (`#de7272`, `#ffca88`, `#fff6a9`, `#b4e4d6`), conexión a Supabase JS, autenticación de usuarios y gráficos de telemetría en vivo con Chart.js.

---

## 🔐 Nota de Seguridad (Variables de Entorno)
> **Atención:** Por buenas prácticas de ciberseguridad y protección de secretos, las claves reales de la API (`SUPABASE_URL` y `SUPABASE_KEY`) han sido sustituidas por marcadores de posición (`placeholders`) en este repositorio público. Para la evaluación o despliegue en entorno local, configurar dichas variables dentro de los archivos `main.py` e `index.html`.

---

## 🚀 Guía de Despliegue y Ejecución

### 1. Base de Datos (Supabase)
1. Crear un proyecto en [Supabase.com](https://supabase.com).
2. Ir a **SQL Editor**, copiar y ejecutar el contenido del archivo `schema.sql`.

### 2. MicroPython (ESP32 / Wokwi)
1. Cargar el archivo `main.py` en la memoria del ESP32 (usando Thonny IDE) o en el simulador online [Wokwi.com](https://wokwi.com).
2. En Wokwi, usar la red Wi-Fi virtual:
   ```python
   WIFI_SSID = "Wokwi-GUEST"
   WIFI_PASS = ""
Introducir las credenciales de la API de Supabase en SUPABASE_URL y SUPABASE_KEY.

Iniciar la simulación.

3. Dashboard Web
Abrir el archivo index.html en cualquier navegador web moderno.

Las tarjetas de métricas, gráficos de peso y registros históricos se actualizarán automáticamente cada 3 segundos.