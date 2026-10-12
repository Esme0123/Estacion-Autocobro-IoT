-- ============================================================
-- BASE DE DATOS: ESTACIÓN DE AUTOCOBRO INTELIGENTE IOT
-- ============================================================

-- 1. Tabla de Inventario de Productos
CREATE TABLE IF NOT EXISTS productos (
    id SERIAL PRIMARY KEY,
    codigo_tag VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    precio NUMERIC(10,2) NOT NULL,
    peso_esperado_g NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Registro de Lecturas de Telemetría IoT
CREATE TABLE IF NOT EXISTS lecturas_iot (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    codigo_escaneado VARCHAR(50),
    peso_medido_g NUMERIC(10,2),
    distancia_cm NUMERIC(10,2),
    estado_validacion VARCHAR(20) DEFAULT 'PENDIENTE'
);

-- 3. Tabla de Registro de Transacciones de Compra
CREATE TABLE IF NOT EXISTS transacciones (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    usuario_id UUID REFERENCES auth.users(id),
    monto_total NUMERIC(10,2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'COMPLETADO'
);

-- ============================================================
-- SEGURIDAD Y POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE lecturas_iot ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

-- Permitir inserción anónima desde el nodo IoT ESP32
CREATE POLICY "Permitir insercion anonima IoT" 
ON lecturas_iot FOR INSERT 
TO anon 
WITH CHECK (true);

-- Permitir lectura pública para el Dashboard web
CREATE POLICY "Permitir lectura publica de lecturas" 
ON lecturas_iot FOR SELECT 
TO anon 
USING (true);

CREATE POLICY "Permitir lectura publica de productos" 
ON productos FOR SELECT 
TO anon 
USING (true);

-- ============================================================
-- DATOS INICIALES DE PRUEBA (PRODUCTOS)
-- ============================================================

INSERT INTO productos (codigo_tag, nombre, precio, peso_esperado_g) VALUES
('TAG_LECHE_1L', 'Leche Entera 1 Litro', 7.50, 1025.00),
('TAG_PAN_500G', 'Pan de Molde 500g', 12.00, 510.00),
('TAG_GALLETAS', 'Galletas de Chocolate', 5.50, 210.00)
ON CONFLICT (codigo_tag) DO NOTHING;