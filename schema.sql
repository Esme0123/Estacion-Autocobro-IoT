-- ============================================================================
--  ESTACIÓN DE AUTOCOBRO INTELIGENTE (SELF-CHECKOUT) - IoT
--  Base de Datos PostgreSQL / Supabase
--  Universidad Católica Boliviana "San Pablo" - Internet de las Cosas (IoT)
-- ============================================================================
--  Contenido:
--   1. Extensiones y esquema
--   2. Tablas (7): perfiles, categorias, estaciones_autocobro, productos,
--      lecturas_iot, transacciones, detalle_transacciones
--   3. Índices y triggers
--   4. Row Level Security (RLS) y políticas
--   5. Publicación Realtime para el Dashboard
--   6. Datos iniciales de prueba (seed)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTENSIONES Y ESQUEMA
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------------

-- 2.1 Perfiles / Usuarios (enlaza con auth.users de Supabase)
create table if not exists public.perfiles (
    id              uuid primary key references auth.users (id) on delete cascade,
    nombre_completo text not null default 'Usuario',
    rol             text not null default 'CLIENTE'
                    check (rol in ('ADMIN', 'SUPERVISOR', 'CLIENTE')),
    created_at      timestamptz not null default now()
);

-- 2.2 Categorías de productos
create table if not exists public.categorias (
    id          bigserial primary key,
    nombre      text not null unique,
    descripcion text,
    created_at  timestamptz not null default now()
);

-- 2.3 Estaciones de autocobro (cajas IoT desplegadas)
create table if not exists public.estaciones_autocobro (
    id              bigserial primary key,
    codigo_estacion text not null unique,
    ubicacion       text,
    estado          text not null default 'ACTIVA'
                    check (estado in ('ACTIVA', 'INACTIVA', 'MANTENIMIENTO')),
    created_at      timestamptz not null default now()
);

-- 2.4 Productos (maestro de inventario etiquetado con RFID)
create table if not exists public.productos (
    id              bigserial primary key,
    categoria_id    bigint references public.categorias (id) on delete set null,
    codigo_tag      text not null unique,
    nombre          text not null,
    precio          numeric(10, 2) not null check (precio >= 0),
    peso_esperado_g numeric(10, 2) not null check (peso_esperado_g >= 0),
    stock           integer not null default 0 check (stock >= 0),
    created_at      timestamptz not null default now()
);

-- 2.5 Lecturas de telemetría enviadas por el nodo ESP32
create table if not exists public.lecturas_iot (
    id                bigserial primary key,
    estacion_id       bigint references public.estaciones_autocobro (id) on delete set null,
    created_at        timestamptz not null default now(),
    codigo_escaneado  text,
    peso_medido_g     numeric(10, 2),
    distancia_cm      numeric(10, 2),
    estado_validacion text not null default 'PENDIENTE'
                      check (estado_validacion in
                             ('PENDIENTE', 'CORRECTO', 'ERROR_PESO', 'ERROR_LECTURA'))
);

-- 2.6 Transacciones (cabecera de compra)
create table if not exists public.transacciones (
    id           bigserial primary key,
    estacion_id  bigint references public.estaciones_autocobro (id) on delete set null,
    usuario_id   uuid references public.perfiles (id) on delete set null,
    monto_total  numeric(10, 2) not null check (monto_total >= 0),
    metodo_pago  text not null default 'EFECTIVO'
                 check (metodo_pago in ('EFECTIVO', 'QR', 'TARJETA')),
    estado       text not null default 'COMPLETADO'
                 check (estado in ('PENDIENTE', 'COMPLETADO', 'ANULADO')),
    created_at   timestamptz not null default now()
);

-- 2.7 Detalle de transacciones (líneas de venta)
create table if not exists public.detalle_transacciones (
    id             bigserial primary key,
    transaccion_id bigint not null references public.transacciones (id) on delete cascade,
    producto_id    bigint references public.productos (id) on delete set null,
    cantidad       integer not null default 1 check (cantidad > 0),
    precio_unitario numeric(10, 2) not null check (precio_unitario >= 0),
    subtotal       numeric(10, 2) not null check (subtotal >= 0)
);

-- ---------------------------------------------------------------------------
-- 3. ÍNDICES Y TRIGGERS
-- ---------------------------------------------------------------------------
create index if not exists idx_productos_categoria   on public.productos (categoria_id);
create index if not exists idx_lecturas_estacion     on public.lecturas_iot (estacion_id);
create index if not exists idx_lecturas_created_at   on public.lecturas_iot (created_at desc);
create index if not exists idx_transacciones_usuario on public.transacciones (usuario_id);
create index if not exists idx_detalle_transaccion   on public.detalle_transacciones (transaccion_id);

-- Crea automáticamente un perfil cuando un usuario se registra en Supabase Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.perfiles (id, nombre_completo, rol)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'nombre_completo', new.email, 'Usuario'),
        coalesce(new.raw_user_meta_data ->> 'rol', 'CLIENTE')
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------------
alter table public.perfiles              enable row level security;
alter table public.categorias            enable row level security;
alter table public.estaciones_autocobro  enable row level security;
alter table public.productos             enable row level security;
alter table public.lecturas_iot          enable row level security;
alter table public.transacciones         enable row level security;
alter table public.detalle_transacciones enable row level security;

-- 4.1 perfiles: cada usuario ve/edita su propio perfil; ADMIN ve todos
drop policy if exists "perfiles_select_propio" on public.perfiles;
create policy "perfiles_select_propio" on public.perfiles
    for select using (auth.uid() = id or auth.jwt() ->> 'email' = 'admin@ucb.edu.bo');

drop policy if exists "perfiles_update_propio" on public.perfiles;
create policy "perfiles_update_propio" on public.perfiles
    for update using (auth.uid() = id);

drop policy if exists "perfiles_insert_propio" on public.perfiles;
create policy "perfiles_insert_propio" on public.perfiles
    for insert with check (auth.uid() = id);

-- 4.2 Catálogo: lectura pública (anon) y escritura para autenticados
drop policy if exists "categorias_select_publico" on public.categorias;
create policy "categorias_select_publico" on public.categorias
    for select to anon, authenticated using (true);

drop policy if exists "categorias_admin" on public.categorias;
create policy "categorias_admin" on public.categorias
    for all to authenticated using (true) with check (true);

drop policy if exists "estaciones_select_publico" on public.estaciones_autocobro;
create policy "estaciones_select_publico" on public.estaciones_autocobro
    for select to anon, authenticated using (true);

drop policy if exists "estaciones_admin" on public.estaciones_autocobro;
create policy "estaciones_admin" on public.estaciones_autocobro
    for all to authenticated using (true) with check (true);

drop policy if exists "productos_select_publico" on public.productos;
create policy "productos_select_publico" on public.productos
    for select to anon, authenticated using (true);

drop policy if exists "productos_admin" on public.productos;
create policy "productos_admin" on public.productos
    for all to authenticated using (true) with check (true);

-- 4.3 lecturas_iot: el nodo ESP32 (anon) inserta; el dashboard lee
drop policy if exists "lecturas_insert_iot" on public.lecturas_iot;
create policy "lecturas_insert_iot" on public.lecturas_iot
    for insert to anon, authenticated with check (true);

drop policy if exists "lecturas_select_publico" on public.lecturas_iot;
create policy "lecturas_select_publico" on public.lecturas_iot
    for select to anon, authenticated using (true);

-- 4.4 transacciones: lectura/escritura para autenticados
drop policy if exists "transacciones_authenticated" on public.transacciones;
create policy "transacciones_authenticated" on public.transacciones
    for all to authenticated using (true) with check (true);

-- 4.5 detalle_transacciones: lectura/escritura para autenticados
drop policy if exists "detalle_authenticated" on public.detalle_transacciones;
create policy "detalle_authenticated" on public.detalle_transacciones
    for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 5. REALTIME (suscripciones en vivo del Dashboard)
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'lecturas_iot'
    ) then
        alter publication supabase_realtime add table public.lecturas_iot;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. DATOS INICIALES DE PRUEBA (SEED)
-- ---------------------------------------------------------------------------

-- 6.1 Categorías
insert into public.categorias (nombre, descripcion) values
    ('Lácteos',   'Leches, yogures y derivados'),
    ('Panadería', 'Panes, bollería y repostería'),
    ('Snacks',    'Galletas, papas fritas y dulces'),
    ('Bebidas',   'Gaseosas, jugos y aguas')
on conflict (nombre) do nothing;

-- 6.2 Estación de autocobro
insert into public.estaciones_autocobro (codigo_estacion, ubicacion, estado) values
    ('CAJA_IOT_01', 'Sucursal Central - Pasillo 1', 'ACTIVA')
on conflict (codigo_estacion) do nothing;

-- 6.3 Productos (codigo_tag = etiqueta RFID)
insert into public.productos (categoria_id, codigo_tag, nombre, precio, peso_esperado_g, stock)
select c.id, 'TAG_LECHE_1L', 'Leche Entera 1 Litro', 7.50, 1025.00, 40
from public.categorias c where c.nombre = 'Lácteos'
on conflict (codigo_tag) do nothing;

insert into public.productos (categoria_id, codigo_tag, nombre, precio, peso_esperado_g, stock)
select c.id, 'TAG_PAN_500G', 'Pan de Molde 500g', 12.00, 510.00, 25
from public.categorias c where c.nombre = 'Panadería'
on conflict (codigo_tag) do nothing;

insert into public.productos (categoria_id, codigo_tag, nombre, precio, peso_esperado_g, stock)
select c.id, 'TAG_GALLETAS', 'Galletas de Chocolate', 5.50, 210.00, 60
from public.categorias c where c.nombre = 'Snacks'
on conflict (codigo_tag) do nothing;

insert into public.productos (categoria_id, codigo_tag, nombre, precio, peso_esperado_g, stock)
select c.id, 'TAG_JUGO_1L', 'Jugo de Naranja 1 Litro', 10.00, 1060.00, 30
from public.categorias c where c.nombre = 'Bebidas'
on conflict (codigo_tag) do nothing;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
