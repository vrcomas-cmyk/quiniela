-- =============================================================================
-- SINCRONIZAR RESULTADOS ENTRE QUINIELAS (bases independientes)
-- =============================================================================
-- Útil cuando tienes 3 quinielas en 3 proyectos Supabase distintos y quieres
-- capturar los marcadores UNA sola vez y replicarlos a las otras.
--
-- USO:
--   PASO 1. En tu base "maestra" (donde capturas resultados), ejecuta este
--           script. NO modifica nada: solo GENERA texto SQL en la salida.
--   PASO 2. Copia el resultado de la consulta (columna "sql_para_replicar").
--   PASO 3. Pégalo y ejecútalo en el SQL Editor de las otras bases.
--
-- El emparejamiento se hace por (numero, equipo_local, equipo_visitante), que
-- son idénticos en todas las bases porque comparten el mismo seed de schema.sql.
-- =============================================================================

-- ----- A. MARCADORES OFICIALES DE PARTIDOS -----
-- Genera UPDATEs que ubican cada partido por sus equipos y número.
select string_agg(
  format(
    'update public.partidos set goles_local_oficial = %s, goles_visitante_oficial = %s where equipo_local = %L and equipo_visitante = %L and coalesce(numero,-1) = %s;',
    coalesce(goles_local_oficial::text, 'null'),
    coalesce(goles_visitante_oficial::text, 'null'),
    equipo_local,
    equipo_visitante,
    coalesce(numero, -1)
  ),
  E'\n'
) as sql_para_replicar
from public.partidos
where goles_local_oficial is not null
   or goles_visitante_oficial is not null;

-- ----- B. CLASIFICACIÓN OFICIAL (1°/2° por grupo, terceros, top4) -----
-- Borra la clasificación previa en la base destino y reinserta la de la maestra.
-- Empareja grupos por su código (A..L), que es igual en todas las bases.
select
  E'delete from public.resultados_clasificacion;\n' ||
  string_agg(
    case
      when rc.tipo = 'clasif_grupo' then
        format(
          'insert into public.resultados_clasificacion (tipo, grupo_id, posicion, equipo) select %L, g.id, %s, %L from public.grupos g where g.codigo = %L;',
          rc.tipo, rc.posicion, rc.equipo, g.codigo
        )
      when rc.tipo = 'tercero' then
        format(
          'insert into public.resultados_clasificacion (tipo, equipo) values (%L, %L);',
          rc.tipo, rc.equipo
        )
      when rc.tipo = 'top4' then
        format(
          'insert into public.resultados_clasificacion (tipo, posicion, equipo) values (%L, %s, %L);',
          rc.tipo, rc.posicion, rc.equipo
        )
    end,
    E'\n'
  ) ||
  E'\nselect public.recalcular_puntos_clasificacion();'
  as sql_clasificacion_para_replicar
from public.resultados_clasificacion rc
left join public.grupos g on g.id = rc.grupo_id;

-- =============================================================================
-- NOTA: Al ejecutar los UPDATE de la sección A en la base destino, el trigger
-- recalcula automáticamente los puntos de esa base. La sección B termina
-- llamando a recalcular_puntos_clasificacion() para lo mismo.
-- =============================================================================
