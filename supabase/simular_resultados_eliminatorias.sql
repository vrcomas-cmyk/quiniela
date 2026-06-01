-- =============================================================================
-- SIMULAR RESULTADOS DE ELIMINATORIAS
-- =============================================================================
-- Ejecutar DESPUÉS de datos_prueba_eliminatorias.sql
--
-- Carga marcadores oficiales aleatorios para los partidos de prueba de las
-- fases eliminatorias. El trigger recalcula los puntos automáticamente con la
-- puntuación de cada fase (6/3 en rondas, 8/4 en final).
-- =============================================================================

do $$
declare
  v_partido record;
  v_gl int;
  v_gv int;
begin
  for v_partido in
    select p.id from public.partidos p
    join public.fases f on f.id = p.fase_id
    where f.codigo in ('16vos','8vos','4tos','semis','3er_lugar','final')
      and p.sede like '%(PRUEBA)'
  loop
    v_gl := floor(random() * 4)::int;  -- 0..3
    v_gv := floor(random() * 4)::int;
    update public.partidos
      set goles_local_oficial = v_gl, goles_visitante_oficial = v_gv
      where id = v_partido.id;
  end loop;
  raise notice 'Resultados de eliminatorias cargados (puntos recalculados por trigger).';
end $$;

-- =============================================================================
-- VER PUNTOS POR FASE DEL TOP 10
-- =============================================================================
select
  pr.nombre_completo,
  sum(case when f.codigo = 'grupos' then pp.puntos_obtenidos else 0 end) as grupos,
  sum(case when f.codigo = '16vos' then pp.puntos_obtenidos else 0 end) as r16vos,
  sum(case when f.codigo = '8vos' then pp.puntos_obtenidos else 0 end) as octavos,
  sum(case when f.codigo = '4tos' then pp.puntos_obtenidos else 0 end) as cuartos,
  sum(case when f.codigo = 'semis' then pp.puntos_obtenidos else 0 end) as semis,
  sum(case when f.codigo in ('3er_lugar','final') then pp.puntos_obtenidos else 0 end) as finales,
  r.puntos_totales
from public.profiles pr
join public.ranking r on r.user_id = pr.id
left join public.pronosticos_partido pp on pp.user_id = pr.id
left join public.partidos pa on pa.id = pp.partido_id
left join public.fases f on f.id = pa.fase_id
where pr.rol = 'jugador'
group by pr.nombre_completo, r.puntos_totales
order by r.puntos_totales desc
limit 10;
