# 🛒 Estación de Autocobro Inteligente basada en IoT (Self-Checkout)

> **Universidad Católica Boliviana "San Pablo"**
> **Carrera:** Ingeniería de Sistemas
> **Asignatura:** Internet de las Cosas (IoT)
> **Docente:** Ing. Pamela Valenzuela
> **Semestre:** 2026

Prototipo de una **Estación de Autocobro Inteligente** que integra un nodo IoT
(ESP32 + MicroPython) con sensores RFID, celda de carga y ultrasónico, una base
de datos en la nube (**Supabase / PostgreSQL**) y un **Dashboard Web en tiempo
real** (React + Vite).

---

## 👥 Integrantes del Grupo

- Medina Paredes Esmeralda Paula
- Mollinedo Davila Alina
- Osorio Mamani Raquel
- Yahuita Lazarte Luciana Cecilia

---

## 📌 Descripción del Proyecto

El sistema automatiza el cobro de productos en una tienda mediante:

1. **Identificación de artículos** por radiofrecuencia con un lector **RFID RC522**.
2. **Validación de peso** del producto escaneado con una celda de carga y
   amplificador **HX711** (prevención de fraudes en la zona de embolsado).
3. **Detección de presencia** del cliente con un sensor ultrasónico **HC-SR04**.
4. **Confirmación sonora** con un **Buzzer piezoeléctrico**.
5. **Telemetría en tiempo real** enviada por **HTTP POST** desde el ESP32 a la
   tabla `lecturas_iot` de **Supabase**.
6. **Visualización en vivo** en un **Dashboard Web** responsivo con gráficos
   dinámicos, autenticación de usuarios y actualización en tiempo real.

---

## 🧰 Stack Tecnológico

| Capa | Tecnología |
| :--- | :--- |
| **Nodo IoT (Edge)** | ESP32 con **MicroPython**, sensores RFID RC522, HX711, HC-SR04 y Buzzer |
| **Base de Datos** | **Supabase (PostgreSQL)** con esquema relacional, RLS y Realtime |
| **Autenticación** | **Supabase Auth** (`signUp` / `signInWithPassword`) |
| **Frontend** | **React 18 + Vite**, **Supabase JS**, **Chart.js**, **Lucide Icons** |
| **Simulación** | [Wokwi.com](https://wokwi.com) (red virtual `Wokwi-GUEST`) |

---

## 🏗️ Arquitectura y Flujo de Datos

```
  +--------------------+   Wi-Fi / HTTP POST    +----------------------+
  |   Nodo IoT ESP32   |   /rest/v1/           |    Supabase Cloud    |
  |   (MicroPython)    |   lecturas_iot        |   PostgreSQL + Auth  |
  |                    | --------------------> |   + Realtime         |
  |  RFID RC522        |                       |                      |
  |  HX711  (peso)     |                       |  Tablas:             |
  |  HC-SR04 (presencia)|                      |  lecturas_iot        |
  |  Buzzer            |                       |  productos / ...     |
  +--------------------+                       +----------+-----------+
                                                          |
                                              Realtime / SELECT
                                                          |
                                              +-----------v-----------+
                                              |   Dashboard Web       |
                                              |   React + Vite        |
                                              |   Chart.js / Lucide   |
                                              +-----------------------+
```

**Flujo:** el ESP32 lee los sensores → construye un JSON → lo envía por HTTP POST
a Supabase → el Dashboard (suscrito a **Realtime** o por polling de respaldo)
actualiza métricas, gráfico y tabla en vivo.

---

## 🔌 Hardware y Mapeo de Pines (Pinout ESP32)

| Componente / Sensor | Señal | Pin ESP32 | Alimentación |
| :--- | :--- | :--- | :--- |
| **Lector RFID RC522** | SDA, SCK, MOSI, MISO, RST | GPIO 5, 18, 23, 19, 22 | 3.3V / GND |
| **Módulo HX711 (Peso)** | DT (Data), SCK (Clock) | GPIO 16, GPIO 4 | 5V (VIN) / GND |
| **Sensor HC-SR04** | Trig, Echo | GPIO 17, GPIO 2 | 5V (VIN) / GND |
| **Buzzer** | Signal (+) | GPIO 15 | GND |
| **LED de estado Wi-Fi** | Ánodo | GPIO 13 | GND (vía R 220Ω) |

> Nota: se usa GPIO 13 para el LED de estado porque el LED integrado del ESP32
> (GPIO 2) se solapa con el pin *Echo* del HC-SR04.

---

## 📂 Estructura del Repositorio

```
Estacion-Autocobro-IoT/
├── schema.sql                  # Esquema PostgreSQL/Supabase (7 tablas, RLS, seed)
├── main.py                     # Firmware MicroPython para el ESP32 (Wokwi)
├── README.md                   # Este documento
└── dashboard/                  # Aplicación web React + Vite
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── .env.example            # Plantilla de variables de entorno
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── index.css           # Paleta pastel y estilos
        ├── supabaseClient.js   # Cliente de Supabase
        └── components/
            ├── AuthScreen.jsx  # Login / Registro con pestañas
            ├── Dashboard.jsx   # Dashboard en tiempo real
            ├── Header.jsx      # Encabezado + usuario + logout
            ├── MetricCards.jsx # Tarjetas de métricas
            ├── WeightChart.jsx # Gráfico de pesos (Chart.js)
            └── ReadingsTable.jsx # Tabla de lecturas_iot
```

---

## 🎨 Paleta de Colores

| Color | Hex | Uso |
| :--- | :--- | :--- |
| Coral / Salmón | `#de7272` | Botones primarios, errores, acentos y alertas |
| Melocotón | `#ffca88` | Encabezados de métricas, bordes y tarjetas de aviso |
| Crema / Amarillo | `#fff6a9` | Fondos de contenedores secundarios y tarjetas destacadas |
| Verde menta | `#b4e4d6` | Estado exitoso, gráficos, badges y fondo de datos cargados |
| Fondo general | `#f8fafc` | Fondo neutro de la aplicación |

---

## 🚀 Guía de Instalación y Ejecución

### 1. Base de Datos (Supabase)

1. Crear un proyecto en [Supabase.com](https://supabase.com).
2. Ir a **SQL Editor** y ejecutar el contenido completo de `schema.sql`
   (crea las 7 tablas, políticas RLS y datos de prueba).
3. En **Database → Replication**, verificar que la tabla `lecturas_iot` esté
   habilitada en la publicación `supabase_realtime` (el script lo hace por ti).
4. Copiar **Project URL** y **anon public key** desde **Settings → API**.

### 2. Dashboard Web (React + Vite)

```bash
# 1. Entrar a la carpeta del dashboard
cd dashboard

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
#    Copia .env.example a .env y coloca tus credenciales
#    (Windows PowerShell)
Copy-Item .env.example .env
#    (Linux / macOS)
# cp .env.example .env

# 4. Ejecutar en modo desarrollo
npm run dev
```

El dashboard queda disponible en `http://localhost:5173`.

Variables de entorno esperadas en `dashboard/.env`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_publica
```

Compilar para producción:

```bash
npm run build && npm run preview
```

### 3. Nodo IoT (ESP32 / Wokwi)

1. Abrir [Wokwi.com](https://wokwi.com) y crear un proyecto **ESP32**.
2. Pegar el contenido de `main.py` en el editor.
3. Configurar en `main.py`:
   ```python
   WIFI_SSID  = "Wokwi-GUEST"
   WIFI_PASS  = ""
   SUPABASE_URL = "https://tu-proyecto.supabase.co"
   SUPABASE_KEY = "tu_anon_key_publica"
   ESTACION_ID  = 1
   ```
4. Subir `urequests.py` como librería del proyecto (o usar el paquete de
   MicroPython que ya lo incluye).
5. Iniciar la simulación: el nodo enviará una lectura cada 5 segundos y sonará
   el buzzer tras cada envío exitoso.

---

## 🔐 Nota de Seguridad

> Por buenas prácticas de ciberseguridad y protección de secretos, las claves
> reales de la API (`SUPABASE_URL` y `SUPABASE_KEY` / `VITE_SUPABASE_ANON_KEY`)
> han sido reemplazadas por **placeholders** (`https://TU_PROYECTO.supabase.co`,
> `TU_ANON_KEY_PUBLIC`). Configura tus credenciales reales localmente en
> `dashboard/.env` y en `main.py`, archivos que **no deben publicarse** con
> valores reales. El archivo `dashboard/.gitignore` ya excluye `.env`.

---

## 🗃️ Modelo de Datos (Resumen)

| Tabla | Descripción |
| :--- | :--- |
| `perfiles` | Perfiles de usuario vinculados a `auth.users` (rol ADMIN/SUPERVISOR/CLIENTE) |
| `categorias` | Categorías de productos |
| `estaciones_autocobro` | Cajas IoT desplegadas (ej. `CAJA_IOT_01`) |
| `productos` | Maestro de inventario RFID (`codigo_tag` único, precio, peso, stock) |
| `lecturas_iot` | Telemetría cruda enviada por el ESP32 |
| `transacciones` | Cabeceras de compra |
| `detalle_transacciones` | Líneas de detalle de cada transacción |
