-- =============================================================================
-- SIMULAR RESULTADOS OFICIALES (para probar ranking y calculadora de premios)
-- =============================================================================
-- Ejecutar DESPUÉS de datos_prueba.sql
--
-- Carga marcadores oficiales aleatorios para TODOS los partidos de grupos.
-- El trigger recalcula automáticamente los puntos de cada pronóstico.
-- También carga clasificación oficial (1°/2°, terceros, top4) y recalcula.
--
-- Esto te permite ver el ranking poblado y probar la pestaña de Premios.
-- =============================================================================

-- 1. Marcadores oficiales aleatorios para partidos de grupos
do $$
declare
  v_partido record;
  v_gl int;
  v_gv int;
begin
  for v_partido in
    select p.id from public.partidos p
    join public.fases f on f.id = p.fase_id
    where f.codigo = 'grupos'
  loop
    v_gl := floor(random() * 4)::int;  -- 0..3
    v_gv := floor(random() * 4)::int;
    update public.partidos
      set goles_local_oficial = v_gl, goles_visitante_oficial = v_gv
      where id = v_partido.id;
  end loop;
  raise notice 'Resultados oficiales de grupos cargados (puntos recalculados por trigger).';
end $$;

-- 2. Clasificación oficial: tomar 1° y 2° reales aleatorios por grupo
do $$
declare
  v_grupo record;
  v_eq1 text;
  v_eq2 text;
begin
  -- Limpiar clasificación oficial previa
  delete from public.resultados_clasificacion;

  for v_grupo in select id from public.grupos order by codigo loop
    select equipo into v_eq1 from (
      select equipo_local as equipo from public.partidos where grupo_id = v_grupo.id
      union select equipo_visitante from public.partidos where grupo_id = v_grupo.id
    ) q order by random() limit 1;

    select equipo into v_eq2 from (
      select equipo_local as equipo from public.partidos where grupo_id = v_grupo.id
      union select equipo_visitante from public.partidos where grupo_id = v_grupo.id
    ) q where equipo <> v_eq1 order by random() limit 1;

    insert into public.resultados_clasificacion (tipo, grupo_id, posicion, equipo)
    values ('clasif_grupo', v_grupo.id, 1, v_eq1),
           ('clasif_grupo', v_grupo.id, 2, v_eq2);
  end loop;

  -- 8 terceros oficiales aleatorios
  insert into public.resultados_clasificacion (tipo, equipo)
  select 'tercero', equipo from (
    select equipo from (
      select distinct equipo from (
        select equipo_local as equipo from public.partidos
        union select equipo_visitante from public.partidos
      ) q
    ) distintos order by random() limit 8
  ) e;

  -- Top 4 final oficial
  insert into public.resultados_clasificacion (tipo, posicion, equipo)
  select 'top4', row_number() over (), equipo from (
    select equipo from (
      select distinct equipo from (
        select equipo_local as equipo from public.partidos
        union select equipo_visitante from public.partidos
      ) q
    ) distintos order by random() limit 4
  ) e;

  raise notice 'Clasificación oficial cargada.';
end $$;

-- 3. Recalcular puntos de clasificación
select public.recalcular_puntos_clasificacion();

-- =============================================================================
-- VER EL RANKING RESULTANTE
-- =============================================================================
select nombre_completo, pts_partidos, pts_clasificacion, pts_bonus, puntos_totales
from public.ranking
order by puntos_totales desc
limit 20;
