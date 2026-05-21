-- =============================================================================
-- QUINIELA MUNDIAL 2026 - SCHEMA SUPABASE
-- =============================================================================
-- Ejecutar TODO este archivo en el SQL Editor de Supabase
-- (Project Settings -> SQL Editor -> New Query -> pegar -> Run)
-- =============================================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- =============================================================================
-- 1. TABLAS
-- =============================================================================

-- Perfiles (extiende auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text not null,
  rol text not null default 'jugador' check (rol in ('admin', 'jugador')),
  pagado boolean not null default false,
  created_at timestamptz not null default now()
);

-- Fases del torneo
create table if not exists public.fases (
  id uuid primary key default uuid_generate_v4(),
  codigo text unique not null,           -- 'grupos', '16vos', '8vos', '4tos', 'semis', '3er_lugar', 'final'
  nombre text not null,                  -- 'Fase de Grupos', 'Octavos de Final', etc.
  orden int not null,                    -- 1..7 para ordenar visualmente
  pts_marcador_exacto int not null,      -- Puntos por marcador exacto
  pts_acierto_resultado int not null,    -- Puntos por acertar ganador/empate sin marcador
  fecha_apertura timestamptz,            -- Cuando se habilitan los pronósticos (NULL = cerrada)
  fecha_cierre timestamptz,              -- Cuando se cierran los pronósticos
  publicada boolean not null default false, -- Si está visible para los usuarios
  created_at timestamptz not null default now()
);

-- Grupos (solo para fase de grupos)
create table if not exists public.grupos (
  id uuid primary key default uuid_generate_v4(),
  codigo text unique not null,           -- 'A', 'B', 'C', ..., 'L'
  nombre text not null,                  -- 'Grupo A'
  created_at timestamptz not null default now()
);

-- Partidos
create table if not exists public.partidos (
  id uuid primary key default uuid_generate_v4(),
  fase_id uuid not null references public.fases(id) on delete cascade,
  grupo_id uuid references public.grupos(id) on delete set null,
  numero int,                            -- Número de partido para ordenar (1..48 en grupos)
  equipo_local text not null,
  equipo_visitante text not null,
  fecha_partido timestamptz,             -- Fecha y hora del partido
  sede text,
  -- Resultado oficial (NULL = aún no se juega / no registrado)
  goles_local_oficial int,
  goles_visitante_oficial int,
  -- Cierre individual de pronóstico (sobrescribe fecha_cierre de fase si está presente)
  cierre_pronostico timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_partidos_fase on public.partidos(fase_id);
create index if not exists idx_partidos_grupo on public.partidos(grupo_id);

-- Pronósticos de partidos
create table if not exists public.pronosticos_partido (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partido_id uuid not null references public.partidos(id) on delete cascade,
  goles_local int not null check (goles_local >= 0),
  goles_visitante int not null check (goles_visitante >= 0),
  puntos_obtenidos int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, partido_id)
);

create index if not exists idx_pronosticos_user on public.pronosticos_partido(user_id);
create index if not exists idx_pronosticos_partido on public.pronosticos_partido(partido_id);

-- Pronósticos de clasificación (1ro y 2do por grupo + 8 terceros + top 4 final)
-- tipo: 'clasif_grupo' | 'tercero' | 'top4'
create table if not exists public.pronosticos_clasificacion (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('clasif_grupo', 'tercero', 'top4')),
  grupo_id uuid references public.grupos(id) on delete cascade, -- para 'clasif_grupo' y 'tercero'
  posicion int,                          -- 1 o 2 (para clasif_grupo) | 1..4 (para top4) | null para 'tercero'
  equipo text not null,
  puntos_obtenidos int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clasif_user on public.pronosticos_clasificacion(user_id);
create index if not exists idx_clasif_tipo on public.pronosticos_clasificacion(tipo);

-- Resultados oficiales de clasificación (los carga admin)
create table if not exists public.resultados_clasificacion (
  id uuid primary key default uuid_generate_v4(),
  tipo text not null check (tipo in ('clasif_grupo', 'tercero', 'top4')),
  grupo_id uuid references public.grupos(id) on delete cascade,
  posicion int,
  equipo text not null,
  created_at timestamptz not null default now()
);

-- Bonus de top4 (admin marca cuando se haya cerrado el torneo)
create table if not exists public.bonus_otorgados (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,                    -- 'bono_4_finalistas'
  puntos int not null,
  created_at timestamptz not null default now(),
  unique (user_id, tipo)
);

-- =============================================================================
-- 2. FUNCIÓN HELPER: ¿Está cerrado el pronóstico de un partido?
-- =============================================================================
create or replace function public.partido_esta_cerrado(p_partido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- Si el partido tiene cierre individual, usar ese
    (select p.cierre_pronostico < now()
     from public.partidos p
     where p.id = p_partido_id and p.cierre_pronostico is not null),
    -- Si no, usar el de la fase
    (select f.fecha_cierre < now()
     from public.partidos p
     join public.fases f on f.id = p.fase_id
     where p.id = p_partido_id and f.fecha_cierre is not null),
    -- Si no hay cierre definido, está cerrado por seguridad
    true
  );
$$;

-- =============================================================================
-- 3. FUNCIÓN HELPER: ¿Está cerrada una fase completa?
-- =============================================================================
create or replace function public.fase_esta_cerrada(p_fase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select fecha_cierre < now() from public.fases where id = p_fase_id and fecha_cierre is not null),
    true
  );
$$;

-- =============================================================================
-- 4. FUNCIÓN: Recalcular puntos de un partido (cuando admin carga resultado)
-- =============================================================================
create or replace function public.recalcular_puntos_partido(p_partido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gol_local int;
  v_gol_visit int;
  v_pts_exacto int;
  v_pts_resultado int;
begin
  -- Obtener resultado oficial y puntos de la fase
  select p.goles_local_oficial, p.goles_visitante_oficial,
         f.pts_marcador_exacto, f.pts_acierto_resultado
    into v_gol_local, v_gol_visit, v_pts_exacto, v_pts_resultado
    from public.partidos p
    join public.fases f on f.id = p.fase_id
   where p.id = p_partido_id;

  if v_gol_local is null or v_gol_visit is null then
    -- Si se borró el resultado, poner 0 puntos a todos
    update public.pronosticos_partido
       set puntos_obtenidos = 0
     where partido_id = p_partido_id;
    return;
  end if;

  -- Marcador exacto
  update public.pronosticos_partido
     set puntos_obtenidos = v_pts_exacto
   where partido_id = p_partido_id
     and goles_local = v_gol_local
     and goles_visitante = v_gol_visit;

  -- Acierto de ganador/empate sin marcador exacto
  update public.pronosticos_partido
     set puntos_obtenidos = v_pts_resultado
   where partido_id = p_partido_id
     and not (goles_local = v_gol_local and goles_visitante = v_gol_visit)
     and sign(goles_local - goles_visitante) = sign(v_gol_local - v_gol_visit);

  -- Fallidos
  update public.pronosticos_partido
     set puntos_obtenidos = 0
   where partido_id = p_partido_id
     and sign(goles_local - goles_visitante) <> sign(v_gol_local - v_gol_visit);
end;
$$;

-- Trigger: al actualizar resultado oficial, recalcular puntos
create or replace function public.trg_recalcular_puntos()
returns trigger
language plpgsql
as $$
begin
  if (new.goles_local_oficial is distinct from old.goles_local_oficial)
     or (new.goles_visitante_oficial is distinct from old.goles_visitante_oficial) then
    perform public.recalcular_puntos_partido(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_recalcular_puntos on public.partidos;
create trigger trigger_recalcular_puntos
  after update on public.partidos
  for each row execute function public.trg_recalcular_puntos();

-- =============================================================================
-- 5. FUNCIÓN: Recalcular puntos de pronósticos de clasificación
-- =============================================================================
create or replace function public.recalcular_puntos_clasificacion()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- CLASIFICACIÓN POR GRUPO (1ro y 2do)
  -- Reset
  update public.pronosticos_clasificacion set puntos_obtenidos = 0 where tipo = 'clasif_grupo';

  -- 4 puntos: equipo correcto en la posición exacta
  update public.pronosticos_clasificacion pc
     set puntos_obtenidos = 4
    from public.resultados_clasificacion rc
   where pc.tipo = 'clasif_grupo'
     and rc.tipo = 'clasif_grupo'
     and pc.grupo_id = rc.grupo_id
     and pc.posicion = rc.posicion
     and lower(trim(pc.equipo)) = lower(trim(rc.equipo));

  -- 2 puntos: equipo califica pero en posición distinta
  update public.pronosticos_clasificacion pc
     set puntos_obtenidos = 2
   where pc.tipo = 'clasif_grupo'
     and pc.puntos_obtenidos = 0
     and exists (
       select 1 from public.resultados_clasificacion rc
        where rc.tipo = 'clasif_grupo'
          and rc.grupo_id = pc.grupo_id
          and lower(trim(rc.equipo)) = lower(trim(pc.equipo))
     );

  -- TERCEROS (2 puntos por acierto, sin importar grupo)
  update public.pronosticos_clasificacion set puntos_obtenidos = 0 where tipo = 'tercero';
  update public.pronosticos_clasificacion pc
     set puntos_obtenidos = 2
   where pc.tipo = 'tercero'
     and exists (
       select 1 from public.resultados_clasificacion rc
        where rc.tipo = 'tercero'
          and lower(trim(rc.equipo)) = lower(trim(pc.equipo))
     );

  -- TOP 4 FINAL
  update public.pronosticos_clasificacion set puntos_obtenidos = 0 where tipo = 'top4';

  -- Campeón (posicion=1): 8 puntos si exacto
  update public.pronosticos_clasificacion pc
     set puntos_obtenidos = 8
    from public.resultados_clasificacion rc
   where pc.tipo = 'top4' and rc.tipo = 'top4'
     and pc.posicion = 1 and rc.posicion = 1
     and lower(trim(pc.equipo)) = lower(trim(rc.equipo));

  -- 2do, 3ro, 4to: 5 puntos si en la posición exacta
  update public.pronosticos_clasificacion pc
     set puntos_obtenidos = 5
    from public.resultados_clasificacion rc
   where pc.tipo = 'top4' and rc.tipo = 'top4'
     and pc.posicion in (2,3,4) and pc.posicion = rc.posicion
     and lower(trim(pc.equipo)) = lower(trim(rc.equipo));

  -- 3 puntos: equipo está en top 4 pero en posición distinta
  update public.pronosticos_clasificacion pc
     set puntos_obtenidos = 3
   where pc.tipo = 'top4'
     and pc.puntos_obtenidos = 0
     and exists (
       select 1 from public.resultados_clasificacion rc
        where rc.tipo = 'top4'
          and lower(trim(rc.equipo)) = lower(trim(pc.equipo))
     );

  -- BONUS: 4 finalistas exactos en posición exacta
  delete from public.bonus_otorgados where tipo = 'bono_4_finalistas';

  insert into public.bonus_otorgados (user_id, tipo, puntos)
  select pc.user_id, 'bono_4_finalistas', 5
    from public.pronosticos_clasificacion pc
   where pc.tipo = 'top4'
   group by pc.user_id
  having count(*) filter (
    where exists (
      select 1 from public.resultados_clasificacion rc
       where rc.tipo = 'top4'
         and rc.posicion = pc.posicion
         and lower(trim(rc.equipo)) = lower(trim(pc.equipo))
    )
  ) = 4;
end;
$$;

-- =============================================================================
-- 6. VISTA: Ranking en vivo
-- =============================================================================
create or replace view public.ranking as
select
  p.id as user_id,
  p.nombre_completo,
  coalesce(sum_partidos.pts, 0) as pts_partidos,
  coalesce(sum_clasif.pts, 0)   as pts_clasificacion,
  coalesce(sum_bonus.pts, 0)    as pts_bonus,
  coalesce(sum_partidos.pts, 0) + coalesce(sum_clasif.pts, 0) + coalesce(sum_bonus.pts, 0) as puntos_totales
from public.profiles p
left join (
  select user_id, sum(puntos_obtenidos) as pts
    from public.pronosticos_partido
   group by user_id
) sum_partidos on sum_partidos.user_id = p.id
left join (
  select user_id, sum(puntos_obtenidos) as pts
    from public.pronosticos_clasificacion
   group by user_id
) sum_clasif on sum_clasif.user_id = p.id
left join (
  select user_id, sum(puntos) as pts
    from public.bonus_otorgados
   group by user_id
) sum_bonus on sum_bonus.user_id = p.id
where p.rol = 'jugador'
order by puntos_totales desc;

-- Ranking por fase
create or replace view public.ranking_por_fase as
select
  p.id as user_id,
  p.nombre_completo,
  f.id as fase_id,
  f.codigo as fase_codigo,
  f.nombre as fase_nombre,
  f.orden as fase_orden,
  coalesce(sum(pp.puntos_obtenidos), 0) as puntos
  from public.profiles p
  cross join public.fases f
  left join public.partidos pa on pa.fase_id = f.id
  left join public.pronosticos_partido pp on pp.partido_id = pa.id and pp.user_id = p.id
 where p.rol = 'jugador'
 group by p.id, p.nombre_completo, f.id, f.codigo, f.nombre, f.orden;

-- =============================================================================
-- 7. ROW LEVEL SECURITY (RLS) - LO MÁS IMPORTANTE
-- =============================================================================

-- Activar RLS en todas las tablas
alter table public.profiles enable row level security;
alter table public.fases enable row level security;
alter table public.grupos enable row level security;
alter table public.partidos enable row level security;
alter table public.pronosticos_partido enable row level security;
alter table public.pronosticos_clasificacion enable row level security;
alter table public.resultados_clasificacion enable row level security;
alter table public.bonus_otorgados enable row level security;

-- Función helper: ¿el usuario actual es admin?
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and rol = 'admin'
  );
$$;

-- ---------- PROFILES ----------
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (auth.uid() is not null);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    and rol = (select rol from public.profiles where id = auth.uid())  -- no puede auto-promoverse
  );

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.es_admin()) with check (public.es_admin());

-- ---------- FASES (lectura: todos; escritura: admin) ----------
drop policy if exists "fases_select_publicadas" on public.fases;
create policy "fases_select_publicadas" on public.fases
  for select using (publicada = true or public.es_admin());

drop policy if exists "fases_admin_all" on public.fases;
create policy "fases_admin_all" on public.fases
  for all using (public.es_admin()) with check (public.es_admin());

-- ---------- GRUPOS ----------
drop policy if exists "grupos_select_all" on public.grupos;
create policy "grupos_select_all" on public.grupos
  for select using (auth.uid() is not null);

drop policy if exists "grupos_admin_all" on public.grupos;
create policy "grupos_admin_all" on public.grupos
  for all using (public.es_admin()) with check (public.es_admin());

-- ---------- PARTIDOS ----------
drop policy if exists "partidos_select_publicados" on public.partidos;
create policy "partidos_select_publicados" on public.partidos
  for select using (
    public.es_admin()
    or exists (select 1 from public.fases f where f.id = fase_id and f.publicada = true)
  );

drop policy if exists "partidos_admin_all" on public.partidos;
create policy "partidos_admin_all" on public.partidos
  for all using (public.es_admin()) with check (public.es_admin());

-- ---------- PRONÓSTICOS DE PARTIDO (lo más crítico) ----------

-- Ver: mis propios pronósticos SIEMPRE, ajenos solo cuando el partido está cerrado
drop policy if exists "pronosticos_select_propios_o_cerrados" on public.pronosticos_partido;
create policy "pronosticos_select_propios_o_cerrados" on public.pronosticos_partido
  for select using (
    user_id = auth.uid()
    or public.es_admin()
    or public.partido_esta_cerrado(partido_id)
  );

-- Insertar: solo míos, y solo si el partido NO está cerrado
drop policy if exists "pronosticos_insert_si_abierto" on public.pronosticos_partido;
create policy "pronosticos_insert_si_abierto" on public.pronosticos_partido
  for insert with check (
    user_id = auth.uid()
    and not public.partido_esta_cerrado(partido_id)
  );

-- Actualizar: solo míos, y solo si NO está cerrado
drop policy if exists "pronosticos_update_si_abierto" on public.pronosticos_partido;
create policy "pronosticos_update_si_abierto" on public.pronosticos_partido
  for update using (
    user_id = auth.uid()
    and not public.partido_esta_cerrado(partido_id)
  )
  with check (
    user_id = auth.uid()
    and not public.partido_esta_cerrado(partido_id)
  );

-- Borrar: solo míos si está abierto
drop policy if exists "pronosticos_delete_si_abierto" on public.pronosticos_partido;
create policy "pronosticos_delete_si_abierto" on public.pronosticos_partido
  for delete using (
    user_id = auth.uid()
    and not public.partido_esta_cerrado(partido_id)
  );

-- Admin puede todo (incluye recalcular puntos en updates)
drop policy if exists "pronosticos_admin_all" on public.pronosticos_partido;
create policy "pronosticos_admin_all" on public.pronosticos_partido
  for all using (public.es_admin()) with check (public.es_admin());

-- ---------- PRONÓSTICOS DE CLASIFICACIÓN ----------
-- La fase de grupos controla la apertura (clasif_grupo, tercero, top4 se llenan en fase grupos)
drop policy if exists "clasif_select_propios_o_cerrados" on public.pronosticos_clasificacion;
create policy "clasif_select_propios_o_cerrados" on public.pronosticos_clasificacion
  for select using (
    user_id = auth.uid()
    or public.es_admin()
    or exists (
      select 1 from public.fases f
       where f.codigo = 'grupos' and f.fecha_cierre is not null and f.fecha_cierre < now()
    )
  );

drop policy if exists "clasif_insert_si_abierto" on public.pronosticos_clasificacion;
create policy "clasif_insert_si_abierto" on public.pronosticos_clasificacion
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.fases f
       where f.codigo = 'grupos'
         and f.fecha_apertura is not null and f.fecha_apertura <= now()
         and f.fecha_cierre is not null and f.fecha_cierre > now()
    )
  );

drop policy if exists "clasif_update_si_abierto" on public.pronosticos_clasificacion;
create policy "clasif_update_si_abierto" on public.pronosticos_clasificacion
  for update using (
    user_id = auth.uid()
    and exists (
      select 1 from public.fases f
       where f.codigo = 'grupos'
         and f.fecha_apertura is not null and f.fecha_apertura <= now()
         and f.fecha_cierre is not null and f.fecha_cierre > now()
    )
  );

drop policy if exists "clasif_delete_si_abierto" on public.pronosticos_clasificacion;
create policy "clasif_delete_si_abierto" on public.pronosticos_clasificacion
  for delete using (
    user_id = auth.uid()
    and exists (
      select 1 from public.fases f
       where f.codigo = 'grupos'
         and f.fecha_apertura is not null and f.fecha_apertura <= now()
         and f.fecha_cierre is not null and f.fecha_cierre > now()
    )
  );

drop policy if exists "clasif_admin_all" on public.pronosticos_clasificacion;
create policy "clasif_admin_all" on public.pronosticos_clasificacion
  for all using (public.es_admin()) with check (public.es_admin());

-- ---------- RESULTADOS Y BONUS (solo admin escribe, todos leen) ----------
drop policy if exists "resultados_clasif_select" on public.resultados_clasificacion;
create policy "resultados_clasif_select" on public.resultados_clasificacion
  for select using (auth.uid() is not null);

drop policy if exists "resultados_clasif_admin" on public.resultados_clasificacion;
create policy "resultados_clasif_admin" on public.resultados_clasificacion
  for all using (public.es_admin()) with check (public.es_admin());

drop policy if exists "bonus_select" on public.bonus_otorgados;
create policy "bonus_select" on public.bonus_otorgados
  for select using (auth.uid() is not null);

drop policy if exists "bonus_admin" on public.bonus_otorgados;
create policy "bonus_admin" on public.bonus_otorgados
  for all using (public.es_admin()) with check (public.es_admin());

-- =============================================================================
-- 8. TRIGGER: Crear profile automáticamente al registrarse
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre_completo, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', new.email),
    'jugador'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 9. SEED: Fases con reglas de puntuación según el DOCX
-- =============================================================================
insert into public.fases (codigo, nombre, orden, pts_marcador_exacto, pts_acierto_resultado, publicada)
values
  ('grupos',     'Fase de Grupos',     1, 4, 2, true),
  ('16vos',      'Dieciseisavos de Final (Ronda de 32)', 2, 6, 3, false),
  ('8vos',       'Octavos de Final',   3, 6, 3, false),
  ('4tos',       'Cuartos de Final',   4, 6, 3, false),
  ('semis',      'Semifinales',        5, 6, 3, false),
  ('3er_lugar',  '3er Lugar',          6, 6, 3, false),
  ('final',      'Gran Final',         7, 8, 4, false)
on conflict (codigo) do nothing;

-- =============================================================================
-- 10. SEED: Grupos A..L
-- =============================================================================
insert into public.grupos (codigo, nombre) values
  ('A', 'Grupo A'), ('B', 'Grupo B'), ('C', 'Grupo C'), ('D', 'Grupo D'),
  ('E', 'Grupo E'), ('F', 'Grupo F'), ('G', 'Grupo G'), ('H', 'Grupo H'),
  ('I', 'Grupo I'), ('J', 'Grupo J'), ('K', 'Grupo K'), ('L', 'Grupo L')
on conflict (codigo) do nothing;

-- =============================================================================
-- 11. SEED: 72 partidos de fase de grupos (desde el Excel oficial)
-- =============================================================================
-- Insert helper: insertar partidos a la fase 'grupos'
do $$
declare
  v_fase_id uuid;
  v_grupo_id uuid;
begin
  select id into v_fase_id from public.fases where codigo = 'grupos';

  -- GRUPO A
  select id into v_grupo_id from public.grupos where codigo = 'A';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 1, 'México',         'Sudáfrica',     '2026-06-11 15:00-06', 'CDMX, México'),
    (v_fase_id, v_grupo_id, 2, 'Rep. de Corea',  'Chequia',       '2026-06-11 20:00-06', 'Guadalajara, México'),
    (v_fase_id, v_grupo_id, 3, 'Chequia',        'Sudáfrica',     '2026-06-18 12:00-06', 'Atlanta, EE. UU.'),
    (v_fase_id, v_grupo_id, 4, 'México',         'Rep. de Corea', '2026-06-18 19:00-06', 'Guadalajara, México'),
    (v_fase_id, v_grupo_id, 5, 'Chequia',        'México',        '2026-06-24 21:00-06', 'CDMX, México'),
    (v_fase_id, v_grupo_id, 6, 'Sudáfrica',      'Rep. de Corea', '2026-06-24 21:00-06', 'Monterrey, México')
    on conflict do nothing;

  -- GRUPO B
  select id into v_grupo_id from public.grupos where codigo = 'B';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 7,  'Canadá',         'Bosnia y Herze.', '2026-06-12 15:00-06', 'Toronto, Canadá'),
    (v_fase_id, v_grupo_id, 8,  'Catar',          'Suiza',           '2026-06-13 15:00-06', 'San Francisco, EE. UU.'),
    (v_fase_id, v_grupo_id, 9,  'Suiza',          'Bosnia y Herze.', '2026-06-18 15:00-06', 'Los Ángeles, EE. UU.'),
    (v_fase_id, v_grupo_id, 10, 'Canadá',         'Catar',           '2026-06-18 18:00-06', 'Vancouver, Canadá'),
    (v_fase_id, v_grupo_id, 11, 'Suiza',          'Canadá',          '2026-06-24 15:00-06', 'Vancouver, Canadá'),
    (v_fase_id, v_grupo_id, 12, 'Bosnia y Herze.','Catar',           '2026-06-24 15:00-06', 'Seattle, EE. UU.')
    on conflict do nothing;

  -- GRUPO C
  select id into v_grupo_id from public.grupos where codigo = 'C';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 13, 'Brasil',    'Marruecos', '2026-06-13 18:00-06', 'Nueva York/NJ, EE. UU.'),
    (v_fase_id, v_grupo_id, 14, 'Haití',     'Escocia',   '2026-06-13 21:00-06', 'Boston, EE. UU.'),
    (v_fase_id, v_grupo_id, 15, 'Escocia',   'Marruecos', '2026-06-19 18:00-06', 'Boston, EE. UU.'),
    (v_fase_id, v_grupo_id, 16, 'Brasil',    'Haití',     '2026-06-19 21:00-06', 'Filadelfia, EE. UU.'),
    (v_fase_id, v_grupo_id, 17, 'Brasil',    'Escocia',   '2026-06-24 18:00-06', 'Miami, EE. UU.'),
    (v_fase_id, v_grupo_id, 18, 'Marruecos', 'Haití',     '2026-06-24 18:00-06', 'Atlanta, EE. UU.')
    on conflict do nothing;

  -- GRUPO D
  select id into v_grupo_id from public.grupos where codigo = 'D';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 19, 'Estados Unidos', 'Paraguay',       '2026-06-12 21:00-06', 'Los Ángeles, EE. UU.'),
    (v_fase_id, v_grupo_id, 20, 'Australia',      'Turquía',        '2026-06-14 00:00-06', 'Vancouver, Canadá'),
    (v_fase_id, v_grupo_id, 21, 'Estados Unidos', 'Australia',      '2026-06-19 13:00-06', 'Seattle, EE. UU.'),
    (v_fase_id, v_grupo_id, 22, 'Turquía',        'Paraguay',       '2026-06-19 21:00-06', 'San Francisco, EE. UU.'),
    (v_fase_id, v_grupo_id, 23, 'Turquía',        'Estados Unidos', '2026-06-25 22:00-06', 'Los Ángeles, EE. UU.'),
    (v_fase_id, v_grupo_id, 24, 'Paraguay',       'Australia',      '2026-06-25 22:00-06', 'San Francisco, EE. UU.')
    on conflict do nothing;

  -- GRUPO E
  select id into v_grupo_id from public.grupos where codigo = 'E';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 25, 'Alemania',        'Curazao',         '2026-06-14 13:00-06', 'Houston, EE. UU.'),
    (v_fase_id, v_grupo_id, 26, 'Costa de Marfil', 'Ecuador',         '2026-06-14 19:00-06', 'Filadelfia, EE. UU.'),
    (v_fase_id, v_grupo_id, 27, 'Alemania',        'Costa de Marfil', '2026-06-20 14:00-06', 'Toronto, Canadá'),
    (v_fase_id, v_grupo_id, 28, 'Ecuador',         'Curazao',         '2026-06-20 18:00-06', 'Kansas City, EE. UU.'),
    (v_fase_id, v_grupo_id, 29, 'Curazao',         'Costa de Marfil', '2026-06-25 14:00-06', 'Filadelfia, EE. UU.'),
    (v_fase_id, v_grupo_id, 30, 'Ecuador',         'Alemania',        '2026-06-25 14:00-06', 'Nueva York/NJ, EE. UU.')
    on conflict do nothing;

  -- GRUPO F
  select id into v_grupo_id from public.grupos where codigo = 'F';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 31, 'Países Bajos', 'Japón',         '2026-06-14 16:00-06', 'Dallas, EE. UU.'),
    (v_fase_id, v_grupo_id, 32, 'Suecia',       'Túnez',         '2026-06-14 22:00-06', 'Monterrey, México'),
    (v_fase_id, v_grupo_id, 33, 'Países Bajos', 'Suecia',        '2026-06-20 11:00-06', 'Houston, EE. UU.'),
    (v_fase_id, v_grupo_id, 34, 'Túnez',        'Japón',         '2026-06-21 00:00-06', 'Monterrey, México'),
    (v_fase_id, v_grupo_id, 35, 'Japón',        'Suecia',        '2026-06-25 15:00-06', 'Dallas, EE. UU.'),
    (v_fase_id, v_grupo_id, 36, 'Túnez',        'Países Bajos',  '2026-06-25 15:00-06', 'Kansas City, EE. UU.')
    on conflict do nothing;

  -- GRUPO G
  select id into v_grupo_id from public.grupos where codigo = 'G';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 37, 'Bélgica',       'Egipto',        '2026-06-15 15:00-06', 'Seattle, EE. UU.'),
    (v_fase_id, v_grupo_id, 38, 'Irán',          'Nueva Zelanda', '2026-06-15 21:00-06', 'Los Ángeles, EE. UU.'),
    (v_fase_id, v_grupo_id, 39, 'Bélgica',       'Irán',          '2026-06-21 15:00-06', 'Los Ángeles, EE. UU.'),
    (v_fase_id, v_grupo_id, 40, 'Nueva Zelanda', 'Egipto',        '2026-06-21 19:00-06', 'Vancouver, Canadá'),
    (v_fase_id, v_grupo_id, 41, 'Egipto',        'Irán',          '2026-06-26 21:00-06', 'Seattle, EE. UU.'),
    (v_fase_id, v_grupo_id, 42, 'Nueva Zelanda', 'Bélgica',       '2026-06-26 21:00-06', 'Vancouver, Canadá')
    on conflict do nothing;

  -- GRUPO H
  select id into v_grupo_id from public.grupos where codigo = 'H';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 43, 'España',         'Cabo Verde',     '2026-06-15 12:00-06', 'Atlanta, EE. UU.'),
    (v_fase_id, v_grupo_id, 44, 'Arabia Saudita', 'Uruguay',        '2026-06-15 18:00-06', 'Miami, EE. UU.'),
    (v_fase_id, v_grupo_id, 45, 'España',         'Arabia Saudita', '2026-06-21 12:00-06', 'Atlanta, EE. UU.'),
    (v_fase_id, v_grupo_id, 46, 'Uruguay',        'Cabo Verde',     '2026-06-21 18:00-06', 'Miami, EE. UU.'),
    (v_fase_id, v_grupo_id, 47, 'Cabo Verde',     'Arabia Saudita', '2026-06-26 18:00-06', 'Houston, EE. UU.'),
    (v_fase_id, v_grupo_id, 48, 'Uruguay',        'España',         '2026-06-26 18:00-06', 'Guadalajara, México')
    on conflict do nothing;

  -- GRUPO I
  select id into v_grupo_id from public.grupos where codigo = 'I';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 49, 'Francia',  'Senegal', '2026-06-16 15:00-06', 'Nueva York/NJ, EE. UU.'),
    (v_fase_id, v_grupo_id, 50, 'Irak',     'Noruega', '2026-06-16 18:00-06', 'Boston, EE. UU.'),
    (v_fase_id, v_grupo_id, 51, 'Francia',  'Irak',    '2026-06-21 21:00-06', 'Nueva York/NJ, EE. UU.'),
    (v_fase_id, v_grupo_id, 52, 'Noruega',  'Senegal', '2026-06-21 18:00-06', 'Boston, EE. UU.'),
    (v_fase_id, v_grupo_id, 53, 'Noruega',  'Francia', '2026-06-26 13:00-06', 'Boston, EE. UU.'),
    (v_fase_id, v_grupo_id, 54, 'Senegal',  'Irak',    '2026-06-26 13:00-06', 'Toronto, Canadá')
    on conflict do nothing;

  -- GRUPO J
  select id into v_grupo_id from public.grupos where codigo = 'J';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 55, 'Argentina', 'Argelia',    '2026-06-16 21:00-06', 'Kansas City, EE. UU.'),
    (v_fase_id, v_grupo_id, 56, 'Austria',   'Jordania',   '2026-06-17 00:00-06', 'San Francisco, EE. UU.'),
    (v_fase_id, v_grupo_id, 57, 'Argentina', 'Austria',    '2026-06-22 18:00-06', 'Dallas, EE. UU.'),
    (v_fase_id, v_grupo_id, 58, 'Jordania',  'Argelia',    '2026-06-22 15:00-06', 'Kansas City, EE. UU.'),
    (v_fase_id, v_grupo_id, 59, 'Argelia',   'Austria',    '2026-06-27 15:00-06', 'Kansas City, EE. UU.'),
    (v_fase_id, v_grupo_id, 60, 'Jordania',  'Argentina',  '2026-06-27 15:00-06', 'Dallas, EE. UU.')
    on conflict do nothing;

  -- GRUPO K
  select id into v_grupo_id from public.grupos where codigo = 'K';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 61, 'Portugal',   'RD Congo',    '2026-06-17 13:00-06', 'Houston, EE. UU.'),
    (v_fase_id, v_grupo_id, 62, 'Uzbekistán', 'Colombia',    '2026-06-17 22:00-06', 'CDMX, México'),
    (v_fase_id, v_grupo_id, 63, 'Portugal',   'Uzbekistán',  '2026-06-22 18:00-06', 'Atlanta, EE. UU.'),
    (v_fase_id, v_grupo_id, 64, 'Colombia',   'RD Congo',    '2026-06-23 20:00-06', 'Guadalajara, México'),
    (v_fase_id, v_grupo_id, 65, 'Colombia',   'Portugal',    '2026-06-27 18:00-06', 'Miami, EE. UU.'),
    (v_fase_id, v_grupo_id, 66, 'RD Congo',   'Uzbekistán',  '2026-06-27 18:00-06', 'Atlanta, EE. UU.')
    on conflict do nothing;

  -- GRUPO L
  select id into v_grupo_id from public.grupos where codigo = 'L';
  insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede) values
    (v_fase_id, v_grupo_id, 67, 'Inglaterra', 'Croacia',    '2026-06-17 16:00-06', 'Dallas, EE. UU.'),
    (v_fase_id, v_grupo_id, 68, 'Ghana',      'Panamá',     '2026-06-17 19:00-06', 'Toronto, Canadá'),
    (v_fase_id, v_grupo_id, 69, 'Inglaterra', 'Ghana',      '2026-06-23 16:00-06', 'Boston, EE. UU.'),
    (v_fase_id, v_grupo_id, 70, 'Panamá',     'Croacia',    '2026-06-23 19:00-06', 'Toronto, Canadá'),
    (v_fase_id, v_grupo_id, 71, 'Panamá',     'Inglaterra', '2026-06-27 21:00-06', 'Nueva York/NJ, EE. UU.'),
    (v_fase_id, v_grupo_id, 72, 'Croacia',    'Ghana',      '2026-06-27 21:00-06', 'Filadelfia, EE. UU.')
    on conflict do nothing;
end $$;

-- =============================================================================
-- FIN. Para hacerte admin después de registrarte:
--   update public.profiles set rol = 'admin' where nombre_completo = 'TU NOMBRE';
-- =============================================================================
