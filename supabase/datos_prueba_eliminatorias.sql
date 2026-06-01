-- =============================================================================
-- DATOS DE PRUEBA: Fases eliminatorias (16vos → Final)
-- =============================================================================
-- Ejecutar DESPUÉS de datos_prueba.sql (necesita los 100 usuarios de prueba).
--
-- Genera partidos de prueba para las 6 fases eliminatorias, los publica,
-- crea pronósticos para los 100 usuarios, y deja listo para simular resultados.
--
-- Los partidos de prueba se marcan con sede que termina en '(PRUEBA)' para
-- poder borrarlos sin tocar partidos reales que captures manualmente.
--
-- Número de partidos por fase (formato 48 equipos):
--   16vos = 16, 8vos = 8, 4tos = 4, semis = 2, 3er_lugar = 1, final = 1
-- =============================================================================

do $$
declare
  v_fase record;
  v_n_partidos int;
  v_equipos text[];
  v_total_equipos int;
  v_user record;
  v_partido record;
  i int;
  v_local text;
  v_visit text;
  v_gl int;
  v_gv int;
  v_idx_l int;
  v_idx_v int;
begin
  -- Cargar lista de equipos reales del torneo (de los partidos de grupos)
  select array_agg(distinct equipo) into v_equipos
  from (
    select equipo_local as equipo from public.partidos
    union
    select equipo_visitante from public.partidos
  ) q;
  v_total_equipos := array_length(v_equipos, 1);

  -- Recorrer las fases eliminatorias y asignar número de partidos
  for v_fase in
    select id, codigo, nombre from public.fases
    where codigo in ('16vos','8vos','4tos','semis','3er_lugar','final')
    order by orden
  loop
    v_n_partidos := case v_fase.codigo
      when '16vos' then 16
      when '8vos' then 8
      when '4tos' then 4
      when 'semis' then 2
      when '3er_lugar' then 1
      when 'final' then 1
      else 0
    end;

    -- Crear los partidos de esta fase (equipos aleatorios, marcados como PRUEBA)
    for i in 1..v_n_partidos loop
      v_idx_l := 1 + floor(random() * v_total_equipos)::int;
      v_idx_v := 1 + floor(random() * v_total_equipos)::int;
      while v_idx_v = v_idx_l loop
        v_idx_v := 1 + floor(random() * v_total_equipos)::int;
      end loop;
      v_local := v_equipos[v_idx_l];
      v_visit := v_equipos[v_idx_v];

      insert into public.partidos (fase_id, grupo_id, numero, equipo_local, equipo_visitante, fecha_partido, sede)
      values (
        v_fase.id, null, i, v_local, v_visit,
        now() + (i || ' hours')::interval,
        'Estadio de prueba ' || i || ' (PRUEBA)'
      );
    end loop;

    -- Publicar la fase y abrir ventana de pronósticos (abierta ahora, cierra en 7 días)
    update public.fases
      set publicada = true,
          fecha_apertura = now() - interval '1 hour',
          fecha_cierre = now() + interval '7 days'
      where id = v_fase.id;
  end loop;

  raise notice 'Partidos de eliminatorias creados y fases publicadas.';

  -- Generar pronósticos de los 100 usuarios de prueba para CADA partido eliminatorio
  for v_user in
    select u.id from auth.users u where u.email like '%@test.local'
  loop
    for v_partido in
      select p.id from public.partidos p
      join public.fases f on f.id = p.fase_id
      where f.codigo in ('16vos','8vos','4tos','semis','3er_lugar','final')
    loop
      v_gl := floor(random() * 4)::int;  -- 0..3
      v_gv := floor(random() * 4)::int;
      insert into public.pronosticos_partido (user_id, partido_id, goles_local, goles_visitante)
      values (v_user.id, v_partido.id, v_gl, v_gv)
      on conflict (user_id, partido_id) do nothing;
    end loop;
  end loop;

  raise notice 'Pronósticos de eliminatorias generados para los 100 usuarios.';
end $$;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
select f.nombre,
       count(distinct p.id) as partidos,
       count(pp.id) as pronosticos
from public.fases f
left join public.partidos p on p.fase_id = f.id
left join public.pronosticos_partido pp on pp.partido_id = p.id
where f.codigo in ('16vos','8vos','4tos','semis','3er_lugar','final')
group by f.nombre, f.orden
order by f.orden;
