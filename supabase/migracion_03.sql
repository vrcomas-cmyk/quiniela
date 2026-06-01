-- =============================================================================
-- MIGRACIÓN 03: Pagos parciales, publicación automática, bloqueo por apertura,
--               recordatorios, validaciones anti-duplicado
-- =============================================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de migracion_02.sql
-- Es seguro re-ejecutar.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. PAGOS EN PARCIALIDADES
-- =============================================================================
-- Tabla de abonos: cada fila es un pago parcial de un usuario.
create table if not exists public.pagos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monto numeric(10,2) not null check (monto > 0),
  metodo text,                            -- 'efectivo', 'transferencia', etc. (libre)
  nota text,
  registrado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_pagos_user on public.pagos(user_id);

alter table public.pagos enable row level security;

-- Cada quien ve sus pagos; admin ve todos
drop policy if exists "pagos_select_propio_o_admin" on public.pagos;
create policy "pagos_select_propio_o_admin" on public.pagos
  for select using (user_id = auth.uid() or public.es_admin());

-- Solo admin registra/edita/borra pagos
drop policy if exists "pagos_admin_all" on public.pagos;
create policy "pagos_admin_all" on public.pagos
  for all using (public.es_admin()) with check (public.es_admin());

-- Configuración: costo total de la quiniela (editable). Default 400.
insert into public.configuracion (clave, valor, descripcion)
values ('costo_quiniela', '400', 'Costo total de la quiniela por participante (en pesos)')
on conflict (clave) do nothing;

-- Vista: estado de cuenta por usuario (cuánto debe, cuánto ha pagado)
create or replace view public.estado_pagos as
select
  p.id as user_id,
  p.nombre_completo,
  coalesce(sum(pg.monto), 0) as total_pagado,
  (select valor::numeric from public.configuracion where clave = 'costo_quiniela') as costo_total,
  greatest(
    0,
    (select valor::numeric from public.configuracion where clave = 'costo_quiniela') - coalesce(sum(pg.monto), 0)
  ) as saldo_pendiente,
  (coalesce(sum(pg.monto), 0) >=
    (select valor::numeric from public.configuracion where clave = 'costo_quiniela')) as liquidado
from public.profiles p
left join public.pagos pg on pg.user_id = p.id
where p.rol = 'jugador'
group by p.id, p.nombre_completo;

-- Función helper: ¿el usuario tiene la quiniela liquidada?
create or replace function public.usuario_liquidado(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(pg.monto), 0) >=
    (select valor::numeric from public.configuracion where clave = 'costo_quiniela')
  from public.pagos pg where pg.user_id = p_user_id;
$$;

-- Sincronizar el flag legacy profiles.pagado con el estado real de pagos
-- (para no romper la UI vieja que aún lo lee)
create or replace function public.sync_flag_pagado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  v_user := coalesce(new.user_id, old.user_id);
  update public.profiles
    set pagado = public.usuario_liquidado(v_user)
    where id = v_user;
  return null;
end;
$$;

drop trigger if exists trg_sync_pagado on public.pagos;
create trigger trg_sync_pagado
  after insert or update or delete on public.pagos
  for each row execute function public.sync_flag_pagado();

-- =============================================================================
-- 2. PUBLICACIÓN AUTOMÁTICA (X horas antes de la apertura)
-- =============================================================================
-- Nueva columna: cuántas horas antes de la apertura se debe publicar la fase.
alter table public.fases
  add column if not exists publicar_horas_antes int;

-- Función que publica fases cuyo momento de publicación ya llegó.
-- (la llamará el cron). Una fase se publica si:
--   - tiene fecha_apertura
--   - tiene publicar_horas_antes definido
--   - aún no está publicada
--   - ya estamos dentro de (fecha_apertura - publicar_horas_antes)
create or replace function public.publicar_fases_programadas()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  update public.fases
    set publicada = true
    where publicada = false
      and fecha_apertura is not null
      and publicar_horas_antes is not null
      and now() >= (fecha_apertura - (publicar_horas_antes || ' hours')::interval);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- =============================================================================
-- 3. BLOQUEO DE PRONÓSTICOS ANTES DE LA APERTURA
-- =============================================================================
-- Reforzamos la función que decide si un partido está "cerrado" para edición.
-- Ahora un partido NO acepta pronósticos si:
--   - la fase aún no ha abierto (now < fecha_apertura), O
--   - ya cerró (now > cierre individual o de fase)
-- Esto cubre ambos extremos de la ventana.
create or replace function public.partido_esta_cerrado(p_partido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with info as (
    select
      p.cierre_pronostico as cierre_individual,
      f.fecha_apertura as fase_apertura,
      f.fecha_cierre as fase_cierre
    from public.partidos p
    join public.fases f on f.id = p.fase_id
    where p.id = p_partido_id
  )
  select
    case
      -- Si la fase tiene apertura y aún no llega: cerrado (no se puede pronosticar)
      when (select fase_apertura from info) is not null
           and now() < (select fase_apertura from info)
        then true
      -- Cierre individual del partido (si está definido)
      when (select cierre_individual from info) is not null
        then now() >= (select cierre_individual from info)
      -- Cierre de la fase
      when (select fase_cierre from info) is not null
        then now() >= (select fase_cierre from info)
      -- Sin cierre definido: cerrado por seguridad
      else true
    end;
$$;

-- =============================================================================
-- 4. VALIDACIÓN ANTI-DUPLICADO EN CLASIFICACIÓN
-- =============================================================================
-- Evita que un usuario ponga:
--   - el mismo equipo en 1° y 2° del mismo grupo
--   - el mismo equipo repetido en su top 4
--   - el mismo equipo repetido en sus terceros
create or replace function public.validar_clasificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1° y 2° del mismo grupo no pueden ser el mismo equipo
  if new.tipo = 'clasif_grupo' then
    if exists (
      select 1 from public.pronosticos_clasificacion
      where user_id = new.user_id
        and tipo = 'clasif_grupo'
        and grupo_id = new.grupo_id
        and lower(trim(equipo)) = lower(trim(new.equipo))
        and posicion <> new.posicion
    ) then
      raise exception 'No puedes elegir el mismo equipo (%) en 1° y 2° del mismo grupo.', new.equipo;
    end if;
  end if;

  -- Top 4: no repetir equipo
  if new.tipo = 'top4' then
    if exists (
      select 1 from public.pronosticos_clasificacion
      where user_id = new.user_id
        and tipo = 'top4'
        and lower(trim(equipo)) = lower(trim(new.equipo))
        and posicion <> new.posicion
    ) then
      raise exception 'No puedes repetir el equipo (%) en tu top 4.', new.equipo;
    end if;
  end if;

  -- Terceros: no repetir equipo
  if new.tipo = 'tercero' then
    if exists (
      select 1 from public.pronosticos_clasificacion
      where user_id = new.user_id
        and tipo = 'tercero'
        and lower(trim(equipo)) = lower(trim(new.equipo))
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000')
    ) then
      raise exception 'No puedes repetir el equipo (%) en tus terceros.', new.equipo;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_clasificacion on public.pronosticos_clasificacion;
create trigger trg_validar_clasificacion
  before insert or update on public.pronosticos_clasificacion
  for each row execute function public.validar_clasificacion();

-- =============================================================================
-- 5. SOPORTE PARA RECORDATORIOS / COLA DE CORREOS
-- =============================================================================
-- Cola de correos pendientes de enviar (la procesa la Edge Function vía cron).
create table if not exists public.correos_cola (
  id uuid primary key default uuid_generate_v4(),
  destinatario text not null,
  nombre_destinatario text,
  asunto text not null,
  cuerpo_html text not null,
  tipo text not null default 'generico',   -- 'invitacion', 'recordatorio', 'generico'
  enviado boolean not null default false,
  enviado_en timestamptz,
  error text,
  intentos int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_correos_pendientes on public.correos_cola(enviado) where enviado = false;

alter table public.correos_cola enable row level security;
drop policy if exists "correos_admin_all" on public.correos_cola;
create policy "correos_admin_all" on public.correos_cola
  for all using (public.es_admin()) with check (public.es_admin());

-- Registro de recordatorios ya enviados, para no duplicar
-- (un recordatorio por usuario, por fase, por "momento": '24h' o '2h')
create table if not exists public.recordatorios_enviados (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fase_id uuid not null references public.fases(id) on delete cascade,
  momento text not null,                  -- '24h' | '2h'
  created_at timestamptz not null default now(),
  unique (user_id, fase_id, momento)
);

alter table public.recordatorios_enviados enable row level security;
drop policy if exists "recordatorios_admin_all" on public.recordatorios_enviados;
create policy "recordatorios_admin_all" on public.recordatorios_enviados
  for all using (public.es_admin()) with check (public.es_admin());

-- =============================================================================
-- 6. VISTA: progreso de pronósticos por usuario y fase
-- =============================================================================
-- Cuántos partidos ha pronosticado cada usuario en cada fase (para el contador
-- "llevas 45 de 72" y para el reporte de "quién no ha pronosticado").
create or replace view public.progreso_pronosticos as
select
  pr.id as user_id,
  pr.nombre_completo,
  f.id as fase_id,
  f.codigo as fase_codigo,
  f.nombre as fase_nombre,
  count(distinct pa.id) as total_partidos,
  count(distinct pp.partido_id) as pronosticados,
  count(distinct pa.id) - count(distinct pp.partido_id) as faltantes
from public.profiles pr
cross join public.fases f
left join public.partidos pa on pa.fase_id = f.id
left join public.pronosticos_partido pp
  on pp.partido_id = pa.id and pp.user_id = pr.id
where pr.rol = 'jugador'
group by pr.id, pr.nombre_completo, f.id, f.codigo, f.nombre;

-- =============================================================================
-- FIN MIGRACIÓN 03
-- =============================================================================
