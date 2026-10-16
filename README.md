# 🛒 Estación de Autocobro Inteligente basada en IoT (Self-Checkout)

> **Universidad Católica Boliviana "San Pablo"**  
> **Carrera:** Ingeniería de Sistemas  
> **Asignatura:** Internet de las Cosas (IoT)  
> **Docente:** Ing. Pamela Valenzuela  
> **Semestre:** 2026  

Sistema integral de **Estación de Autocobro Inteligente (Self-Checkout)** que enlaza un nodo físico/simulado IoT (**ESP32 + MicroPython**), una base de datos en la nube (**Supabase PostgreSQL**) y una aplicación web responsiva de doble rol (**React 18 + Vite**) con diseño en **paleta pastel oficial**, gráficos dinámicos y tolerancia anti-fraude en tiempo real.

---

## 👥 Integrantes del Grupo

- Medina Paredes Esmeralda Paula
- Mollinedo Davila Alina
- Osorio Mamani Raquel
- Yahuita Lazarte Luciana Cecilia

---

## 🎨 Paleta de Colores Pastel Oficial

La interfaz implementa estrictamente la guía de diseño pastel del proyecto:

| Color | Código Hex | Aplicación en el Sistema |
| :--- | :--- | :--- |
| **Coral / Salmón** | `#de7272` | Botones primarios, alertas de error, advertencia de báscula y badges de stock bajo |
| **Melocotón** | `#ffca88` | Encabezados de métricas, bordes de contenedores destacados y acentos |
| **Crema** | `#fff6a9` | Fondos de tarjetas de totales, contenedores de escaneo y avisos secundarios |
| **Verde Menta** | `#b4e4d6` | Verificación de peso exitosa ($\pm 10\text{g}$), confirmación de pago y stock óptimo |
| **Fondo Neutro** | `#f8fafc` | Fondo general relajante con tipografía *Outfit* e *Inter* |

---

## 🎯 Arquitectura y Flujo Operativo de Doble Rol

La aplicación web segrega de forma limpia dos experiencias de usuario:

```
                                  +----------------------------+
                                  |    Supabase Cloud (DB)     |
                                  |  PostgreSQL + Auth + RT    |
                                  +--------------+-------------+
                                                 ^
                         HTTP POST / Realtime    |    Realtime / Sync
                                                 v
  +--------------------------+        +----------+-----------+
  |      Nodo IoT ESP32      |        | Aplicación Web React |
  |      (MicroPython)       |        | (Vite + Chart.js)    |
  |                          |        +----------+-----------+
  | - RFID RC522 (escaneo)   |                   |
  | - HX711 (báscula peso)   |        +----------+-----------+
  | - HC-SR04 (proximidad)   |        |                      |
  | - Buzzer confirmación    |   [🛍️ Rol Cliente]      [📊 Rol Gerente]
  +--------------------------+     /cajero               /admin
```

---

### 🛍️ ROL 1: CLIENTE / AUTOCOBRO (`/cajero`)

Flujo guiado paso a paso para el usuario final en la estación:

1. **Inicio de Sesión o Acceso Rápido:**
   - Autenticación con correo y contraseña o acceso con un clic en *"Modo Cajero"* desde `/login`.
2. **Escanear y Registrar Productos:**
   - **Escucha en tiempo real** la tabla `sensor_readings` (filtrando por `sensor_type = 'rc522'`).
   - Al aproximar una etiqueta RFID al lector RC522 (o ingresar código de barras), el producto se busca en la tabla `products` y se añade automáticamente al Carrito de Compras emitiendo un tono sonoro.
3. **Verificación Anti-Fraude de Báscula (HX711):**
   - Compara en tiempo real la masa total esperada del carrito ($\sum \text{expected\_weight\_g} \times \text{cant}$) con el peso físico medido por la celda de carga HX711 (`sensor_type = 'hx711'`).
   - **Tolerancia:** Margen estricto de $\pm 10\text{g}$.
   - **Concordancia ($\le 10\text{g}$):** Notificación en **Verde Menta (`#b4e4d6`)** habilitando el botón *"Proceder al Pago"*.
   - **Discordancia ($> 10\text{g}$):** Alerta en **Coral (`#de7272`)**: *"Por favor coloque el producto en la báscula"* y botón de pago bloqueado.
4. **Pantalla de Pago y Descuento de Stock:**
   - Modal con desglose de la orden y selección de método de pago:
     - 💳 **Tarjeta Débito/Crédito** (formulario visual).
     - 📱 **QR Simple** (código QR bancario con temporizador).
   - Al confirmar el pago:
     - Crea la orden en la tabla `purchases` (`status = 'COMPLETED'`).
     - Inserta los ítems en `purchase_items`.
     - **Descuenta automáticamente el stock** del producto en la tabla `products`.
5. **Liberación de Salida:**
   - Mensaje de felicitación: *"¡Gracias por su compra! Puede retirar sus productos"*.
   - Monitorea el sensor infrarrojo / ultrasónico (`sensor_type = 'proximidad'` o `'magnetico'`) para verificar que el cliente retiró los artículos de la bandeja antes de reiniciar la caja para el siguiente cliente.

---

### 📊 ROL 2: GERENTE / ADMINISTRADOR (`/admin`)

Panel de gestión y telemetría avanzada para supervisores:

1. **Módulo de Gestión de Inventario (CRUD Completo):**
   - Tabla administrativa completa para `products` (`id`, `name`, `barcode`, `rfid_uid`, `price`, `expected_weight_g`, `stock`, `active`).
   - **Badges de Stock:** Etiqueta verde menta para stock normal ($\ge 10$) y badge en coral parpadeante para **Stock Bajo Crítico ($< 10$ unidades)**.
   - Creación de nuevos productos, edición de precios, ajuste de masas esperadas en gramos y cambio de estado activo/inactivo.
2. **Control de Salida de Mercadería:**
   - Historial en vivo de las compras efectuadas (`purchases` y `purchase_items`).
   - Muestra hora exacta, método de pago, productos vendidos, peso medido en balanza y total recaudado.
3. **Dashboard de Telemetría IoT en Tiempo Real:**
   - 4 tarjetas superiores con la paleta pastel oficial (Recaudación, Ventas, Stock Bajo, Lecturas).
   - **Gráfico Dinámico de Pesaje (Chart.js):** Curva continua del peso registrado por la báscula HX711 a lo largo del tiempo.
   - **Gráfico de Actividad:** Frecuencia de eventos de escaneo RFID vs eventos de balanza y presencia.
   - **Feed de Telemetría:** Transmisión en vivo de las filas ingresadas en `sensor_readings`.

---

## 🕹️ Consola de Simulación IoT Integrada

Para facilitar defensas, evaluaciones y pruebas sin requerir hardware físico conectado:

- La aplicación cuenta con un botón flotante **`🕹️ Simulador IoT`** en la esquina superior/inferior.
- Permite emitir con un solo clic:
  - 📡 **Lectura RFID RC522:** Selecciona un producto y dispara su tag.
  - ⚖️ **Báscula HX711:** Envía peso exacto calibrado, peso desviado (+45g para simular fraude) o tara (0g).
  - 🚪 **Sensor de Salida:** Simula el retiro de productos de la bandeja.
- Todas las simulaciones se escriben directamente en Supabase y activan la reactividad en tiempo real del quiosco.

---

## 🔌 Conexión con el Nodo Físico ESP32 (`main.py`)

El archivo [`main.py`](file:///c:/dev/Estacion-Autocobro-IoT/main.py) implementa el firmware MicroPython para el microcontrolador ESP32:

### Mapeo de Pines (Pinout ESP32)

| Componente | Señal | Pin GPIO ESP32 | Alimentación |
| :--- | :--- | :--- | :--- |
| **Lector RFID RC522** | SDA, SCK, MOSI, MISO, RST | GPIO 5, 18, 23, 19, 22 | 3.3V / GND |
| **Módulo HX711 (Peso)** | DT (Data), SCK (Clock) | GPIO 16, GPIO 4 | 5V (VIN) / GND |
| **Sensor HC-SR04** | Trig, Echo | GPIO 17, GPIO 2 | 5V (VIN) / GND |
| **Buzzer Piezoeléctrico** | Señal (+) | GPIO 15 | GND |
| **LED Estado Wi-Fi** | Ánodo | GPIO 13 | GND (con R 220Ω) |

### Estructura de Payload HTTP POST hacia `sensor_readings`

```python
payload = {
    "device_id": "CAJA_IOT_01",
    "sensor_type": "rc522",        # 'rc522', 'hx711' o 'proximidad'
    "numeric_value": 1025.0,       # Peso en g o distancia en cm
    "rfid_uid": "TAG_LECHE_1L",    # Tag escaneado
    "metadata": {"source": "ESP32"}
}
```

---

## 🚀 Guía de Instalación y Puesta en Marcha

### 1. Base de Datos en Supabase

1. Crear un proyecto en [Supabase.com](https://supabase.com).
2. Abrir el **SQL Editor** y ejecutar el contenido completo de [`schema.sql`](file:///c:/dev/Estacion-Autocobro-IoT/schema.sql).
3. Este script crea las tablas (`products`, `sensor_readings`, `purchases`, `purchase_items`, `profiles`), configura las políticas RLS y añade el catálogo inicial con stock y pesos.

### 2. Frontend Web (React + Vite)

```bash
# 1. Entrar al directorio del dashboard
cd dashboard

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno en .env
# VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
# VITE_SUPABASE_ANON_KEY=tu_anon_key

# 4. Iniciar en modo desarrollo
npm run dev
```

La aplicación estará lista en `http://localhost:5173`.

### 3. Rutas Disponibles

- `/login` : Pantalla de autenticación y accesos directos por rol.
- `/cajero` : Flujo guiado de autocobro para clientes con balanza anti-fraude.
- `/admin` : Módulo de inventario, historial de salida y dashboard de telemetría IoT.

---

## 🗃️ Modelo de Datos (PostgreSQL)

| Tabla | Columnas Clave | Propósito |
| :--- | :--- | :--- |
| `products` | `id`, `name`, `barcode`, `rfid_uid`, `price`, `expected_weight_g`, `stock`, `active` | Maestro de productos etiquetados con RFID |
| `sensor_readings` | `id`, `device_id`, `sensor_type`, `numeric_value`, `rfid_uid`, `created_at` | Telemetría en tiempo real recibida del ESP32 |
| `purchases` | `id`, `total`, `status`, `payment_method`, `measured_weight_g`, `created_at` | Cabeceras de compras completadas |
| `purchase_items` | `id`, `purchase_id`, `product_id`, `quantity`, `unit_price`, `subtotal` | Líneas de detalle y control de salida |
| `profiles` | `id`, `full_name`, `role`, `created_at` | Perfiles de usuario vinculados a Supabase Auth |
