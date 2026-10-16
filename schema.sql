-- ============================================================================
-- ESTACIÓN DE AUTOCOBRO INTELIGENTE (SELF-CHECKOUT) - IoT
-- Esquema PostgreSQL / Supabase
-- Universidad Católica Boliviana "San Pablo" - Internet de las Cosas (IoT)
-- ============================================================================
-- Tablas:
--   1. products          (Maestro de inventario con códigos de barra, RFID, pesos y stock)
--   2. sensor_readings   (Telemetría IoT en tiempo real: RFID RC522, Báscula HX711, Proximidad)
--   3. purchases         (Cabecera de transacciones completadas)
--   4. purchase_items    (Detalle de productos vendidos y pesos medidos)
--   5. profiles          (Perfiles de usuario: CLIENTE / SUPERVISOR / ADMIN)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. TABLA: products (Inventario de Productos con RFID)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
    id                bigserial primary key,
    name              text not null,
    barcode           text unique,
    rfid_uid          text unique,
    price             numeric(10, 2) not null check (price >= 0),
    expected_weight_g numeric(10, 2) not null check (expected_weight_g >= 0),
    stock             integer not null default 20 check (stock >= 0),
    active            boolean not null default true,
    description       text,
    image_url         text default '📦',
    created_at        timestamptz not null default now()
);

-- Si la tabla ya existía sin algunas columnas, asegurar compatibilidad:
alter table public.products add column if not exists rfid_uid text;
alter table public.products add column if not exists stock integer default 20 check (stock >= 0);
alter table public.products add column if not exists image_url text default '📦';

-- ---------------------------------------------------------------------------
-- 2. TABLA: sensor_readings (Telemetría de Sensores ESP32)
-- ---------------------------------------------------------------------------
create table if not exists public.sensor_readings (
    id            bigserial primary key,
    device_id     text not null default 'CAJA_IOT_01',
    sensor_type   text not null, -- 'rc522', 'hx711', 'proximidad', 'magnetico'
    numeric_value numeric(10, 2) default 0,
    rfid_uid      text,
    metadata      jsonb default '{}'::jsonb,
    created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. TABLA: purchases (Cabecera de Compras Autocobro)
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
    id                bigserial primary key,
    total             numeric(10, 2) not null check (total >= 0),
    status            text not null default 'COMPLETED', -- 'COMPLETED', 'PENDING', 'CANCELLED'
    payment_method    text default 'TARJETA', -- 'TARJETA', 'QR', 'EFECTIVO'
    customer_id       text,
    measured_weight_g numeric(10, 2) default 0,
    created_at        timestamptz not null default now()
);

-- Asegurar columnas si la tabla ya existía:
alter table public.purchases add column if not exists payment_method text default 'TARJETA';
alter table public.purchases add column if not exists measured_weight_g numeric(10, 2) default 0;

-- ---------------------------------------------------------------------------
-- 4. TABLA: purchase_items (Líneas de Venta)
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_items (
    id                bigserial primary key,
    purchase_id       bigint references public.purchases (id) on delete cascade,
    product_id        bigint references public.products (id) on delete set null,
    quantity          integer not null default 1 check (quantity > 0),
    unit_price        numeric(10, 2) not null check (unit_price >= 0),
    subtotal          numeric(10, 2) not null check (subtotal >= 0),
    measured_weight_g numeric(10, 2) default 0,
    created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. TABLA: profiles (Perfiles de Usuario)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id         uuid primary key references auth.users (id) on delete cascade,
    full_name  text not null default 'Usuario',
    role       text not null default 'CLIENTE' check (role in ('ADMIN', 'SUPERVISOR', 'CLIENTE')),
    created_at timestamptz not null default now()
);

-- Trigger para crear perfil automáticamente al registrar usuario
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, role)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'nombre_completo', new.email, 'Usuario'),
        coalesce(new.raw_user_meta_data ->> 'rol', 'CLIENTE')
    )
    on conflict (id) do update set
        full_name = excluded.full_name,
        role = excluded.role;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_profiles on auth.users;
create trigger on_auth_user_created_profiles
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 6. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------------
alter table public.products        enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.purchases       enable row level security;
alter table public.purchase_items  enable row level security;
alter table public.profiles        enable row level security;

-- 6.1 products: lectura y escritura pública para demo / cajero / admin
drop policy if exists "products_public_all" on public.products;
create policy "products_public_all" on public.products
    for all to anon, authenticated using (true) with check (true);

-- 6.2 sensor_readings: inserción y lectura libre para nodo IoT ESP32 y Dashboard
drop policy if exists "sensor_readings_all" on public.sensor_readings;
create policy "sensor_readings_all" on public.sensor_readings
    for all to anon, authenticated using (true) with check (true);

-- 6.3 purchases y purchase_items: lectura y creación abierta para registrar compras
drop policy if exists "purchases_all" on public.purchases;
create policy "purchases_all" on public.purchases
    for all to anon, authenticated using (true) with check (true);

drop policy if exists "purchase_items_all" on public.purchase_items;
create policy "purchase_items_all" on public.purchase_items
    for all to anon, authenticated using (true) with check (true);

-- 6.4 profiles
drop policy if exists "profiles_all" on public.profiles;
create policy "profiles_all" on public.profiles
    for all to anon, authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 7. PUBLICACIÓN REALTIME (Suscripción en vivo)
-- ---------------------------------------------------------------------------
do $$
begin
    -- sensor_readings
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sensor_readings'
    ) then
        alter publication supabase_realtime add table public.sensor_readings;
    end if;

    -- products
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
    ) then
        alter publication supabase_realtime add table public.products;
    end if;

    -- purchases
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'purchases'
    ) then
        alter publication supabase_realtime add table public.purchases;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. DATOS INICIALES DE PRUEBA (SEED)
-- ---------------------------------------------------------------------------
insert into public.products (id, name, barcode, rfid_uid, price, expected_weight_g, stock, active, description, image_url) values
    (1, 'Leche Entera 1 Litro',       '7771234001', 'TAG_LECHE_1L',    7.50,  1025.00, 40, true, 'Leche pasteurizada en bolsa de 1000 ml', '🥛'),
    (2, 'Pan de Molde 500g',          '7771234002', 'TAG_PAN_500G',   12.00,   510.00,  8, true, 'Pan blanco rebanado familiar (Stock Bajo)', '🍞'),
    (3, 'Galletas de Chocolate 200g', '7771234003', 'TAG_GALLETAS',    5.50,   210.00, 60, true, 'Galletas rellenas con crema de cacao', '🍪'),
    (4, 'Jugo de Naranja 1 Litro',    '7771234004', 'TAG_JUGO_1L',    10.00,  1060.00, 25, true, 'Jugo 100% natural sin pulpa', '🧃'),
    (5, 'Café Tostado y Molido 250g', '7771234005', 'TAG_CAFE_250G',  28.00,   265.00,  5, true, 'Café arábica de altura yungueño (Crítico)', '☕'),
    (6, 'Manzanas Rojas 1 kg',        '7771234006', 'TAG_MANZANAS_1KG',14.00, 1005.00, 32, true, 'Manzanas rojas frescas seleccionadas', '🍎')
on conflict (id) do update set
    name = excluded.name,
    barcode = excluded.barcode,
    rfid_uid = excluded.rfid_uid,
    price = excluded.price,
    expected_weight_g = excluded.expected_weight_g,
    stock = excluded.stock,
    active = excluded.active;

-- Reiniciar secuencia para evitar colisiones
select setval('products_id_seq', (select coalesce(max(id), 1) from public.products));
