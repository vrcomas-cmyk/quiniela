-- =============================================================================
-- MIGRACIÓN 02: Configuración editable, invitaciones, borrar usuarios
-- =============================================================================
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de schema.sql
-- Es seguro re-ejecutar (todo con IF NOT EXISTS / drop-and-create)
-- =============================================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- =============================================================================
-- 1. TABLA: configuracion (clave/valor para textos editables)
-- =============================================================================
create table if not exists public.configuracion (
  clave text primary key,
  valor text not null,
  descripcion text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.configuracion enable row level security;

drop policy if exists "configuracion_select_all" on public.configuracion;
create policy "configuracion_select_all" on public.configuracion
  for select using (auth.uid() is not null);

drop policy if exists "configuracion_admin_all" on public.configuracion;
create policy "configuracion_admin_all" on public.configuracion
  for all using (public.es_admin()) with check (public.es_admin());

-- Seed inicial: texto de "cómo se ganan los puntos" (Markdown simple)
insert into public.configuracion (clave, valor, descripcion) values
  ('reglas_puntuacion',
$$### Fase de Grupos
- Marcador exacto: **4 puntos**
- Acierto a ganador/empate: **2 puntos**
- 1° y 2° de cada grupo en posición exacta: **4 pts**; sin posición: **2 pts**
- 8 mejores terceros (sin importar grupo): **2 pts** c/u

### Dieciseisavos, Octavos, Cuartos, Semifinales y 3er Lugar
- Marcador exacto: **6 puntos**
- Acierto a ganador/empate: **3 puntos**

### Gran Final
- Marcador exacto: **8 puntos**
- Acierto a ganador/empate: **4 puntos**

### Top 4 final
- Campeón en posición exacta: **8 pts**
- 2°, 3°, 4° en posición exacta: **5 pts** c/u
- Equipo en top 4, posición errada: **3 pts**
- **Bono:** 4 finalistas en orden exacto = **+5 pts**

### Importante
A partir de dieciseisavos, el marcador cuenta hasta el final del tiempo extra. **No se consideran los penales.**$$,
   'Texto Markdown que aparece en la página de inicio explicando cómo se ganan los puntos')
on conflict (clave) do nothing;

insert into public.configuracion (clave, valor, descripcion) values
  ('texto_bienvenida',
   'Tus pronósticos te esperan. Acumula puntos en cada fase, conserva tu lugar en el ranking, y al final del torneo presume que lo viste venir.',
   'Mensaje de bienvenida en la página de inicio')
on conflict (clave) do nothing;

insert into public.configuracion (clave, valor, descripcion) values
  ('texto_premios',
   '1° lugar: **35%** · 2° lugar: **25%** · 3° lugar: **20%** · 4° lugar: **15%** · 5° lugar: **5%** del bote total',
   'Distribución de premios mostrada en el ranking')
on conflict (clave) do nothing;

-- =============================================================================
-- 2. TABLA: invitaciones (token único para activación de cuenta)
-- =============================================================================
create table if not exists public.invitaciones (
  id uuid primary key default uuid_generate_v4(),
  token text unique not null,
  email text not null,
  nombre_completo text not null,
  -- Quien la creó
  creada_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expira_en timestamptz not null default (now() + interval '30 days'),
  -- Quién activó (cuando se redime)
  usada_en timestamptz,
  user_id uuid references auth.users(id) on delete set null
);

create index if not exists idx_invitaciones_token on public.invitaciones(token);
create index if not exists idx_invitaciones_email on public.invitaciones(email);

alter table public.invitaciones enable row level security;

-- Solo admin puede ver/crear invitaciones desde el frontend
drop policy if exists "invitaciones_admin_all" on public.invitaciones;
create policy "invitaciones_admin_all" on public.invitaciones
  for all using (public.es_admin()) with check (public.es_admin());

-- Política especial: cualquiera puede leer SU invitación si conoce el token
-- (necesario para que el flujo público de activación pueda mostrar el nombre)
drop policy if exists "invitaciones_select_publica_por_token" on public.invitaciones;
create policy "invitaciones_select_publica_por_token" on public.invitaciones
  for select using (
    usada_en is null
    and expira_en > now()
  );

-- =============================================================================
-- 3. FUNCIÓN: Generar token para invitación
-- =============================================================================
create or replace function public.generar_token_invitacion()
returns text
language sql
volatile
as $$
  -- Token alfanumérico de 32 caracteres (URL-safe)
  select encode(gen_random_bytes(24), 'base64')
    || extract(epoch from now())::bigint::text;
$$;

-- =============================================================================
-- 4. RPC: Marcar invitación como usada (la llama la Edge Function)
-- =============================================================================
create or replace function public.redimir_invitacion(
  p_token text,
  p_user_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitacion public.invitaciones;
begin
  select * into v_invitacion
    from public.invitaciones
   where token = p_token
     and usada_en is null
     and expira_en > now()
   limit 1;

  if not found then
    return json_build_object('ok', false, 'error', 'Invitación inválida o expirada');
  end if;

  update public.invitaciones
     set usada_en = now(), user_id = p_user_id
   where id = v_invitacion.id;

  -- Asegurar que el profile tenga el nombre correcto
  update public.profiles
     set nombre_completo = v_invitacion.nombre_completo
   where id = p_user_id;

  return json_build_object(
    'ok', true,
    'email', v_invitacion.email,
    'nombre_completo', v_invitacion.nombre_completo
  );
end;
$$;

-- =============================================================================
-- FIN MIGRACIÓN 02
-- =============================================================================
