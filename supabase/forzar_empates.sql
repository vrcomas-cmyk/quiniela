-- =============================================================================
-- FORZAR ESCENARIOS DE EMPATE (para probar la calculadora de premios)
-- =============================================================================
-- La calculadora de premios (pestaña 💰 Premios) lee la vista `ranking`, que
-- suma puntos de pronosticos_partido + pronosticos_clasificacion + bonus.
--
-- Para forzar empates exactos en el top 5, este script ajusta los puntos
-- de los pronósticos de clasificación de usuarios de prueba específicos,
-- dándoles totales controlados.
--
-- IMPORTANTE: ejecutar DESPUÉS de simular_resultados.sql (que ya pobló puntos).
-- Esto SOBRESCRIBE los puntos de algunos usuarios de prueba para crear el
-- escenario deseado. Elige UNO de los bloques de abajo (descomenta el que
-- quieras probar) y ejecútalo.
--
-- Cómo funciona: ponemos en CERO todos los puntos de los 6 primeros usuarios
-- de prueba, y luego les inyectamos puntos vía un registro de bonus controlado,
-- para que su `puntos_totales` en el ranking sea exactamente el deseado.
-- =============================================================================

-- Helper: resetear puntos de los usuarios prueba001..prueba006 a 0
-- y asignarles puntos exactos vía bonus_otorgados.
-- (Usamos bonus como vehículo porque la vista ranking lo suma directo.)

create or replace function public.forzar_puntos_prueba(p_email text, p_puntos int)
returns void language plpgsql as $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where email = p_email;
  if v_uid is null then
    raise notice 'Usuario % no existe', p_email;
    return;
  end if;
  -- Poner a 0 todos sus puntos de partidos y clasificación
  update public.pronosticos_partido set puntos_obtenidos = 0 where user_id = v_uid;
  update public.pronosticos_clasificacion set puntos_obtenidos = 0 where user_id = v_uid;
  -- Inyectar puntos exactos vía bonus (borrar previo primero)
  delete from public.bonus_otorgados where user_id = v_uid and tipo = 'ajuste_prueba';
  insert into public.bonus_otorgados (user_id, tipo, puntos)
  values (v_uid, 'ajuste_prueba', p_puntos);
end $$;

-- ---------------------------------------------------------------------------
-- ESCENARIO R2 (el que te interesa): 1 líder, 3 empatados en 2do lugar
-- 1° con 140, tres con 139, uno con 130
-- ---------------------------------------------------------------------------
select public.forzar_puntos_prueba('prueba001@test.local', 140);
select public.forzar_puntos_prueba('prueba002@test.local', 139);
select public.forzar_puntos_prueba('prueba003@test.local', 139);
select public.forzar_puntos_prueba('prueba004@test.local', 139);
select public.forzar_puntos_prueba('prueba005@test.local', 130);
-- (Asegurar que ningún otro usuario de prueba supere 130: los bajamos)
do $$
declare r record;
begin
  for r in select id, email from auth.users where email like '%@test.local'
           and email not in ('prueba001@test.local','prueba002@test.local',
             'prueba003@test.local','prueba004@test.local','prueba005@test.local')
  loop
    update public.pronosticos_partido set puntos_obtenidos = 0 where user_id = r.id;
    update public.pronosticos_clasificacion set puntos_obtenidos = 0 where user_id = r.id;
    delete from public.bonus_otorgados where user_id = r.id and tipo = 'ajuste_prueba';
    insert into public.bonus_otorgados (user_id, tipo, puntos)
    values (r.id, 'ajuste_prueba', floor(random()*120)::int);  -- 0..119
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- OTROS ESCENARIOS (descomenta para probar):
-- ---------------------------------------------------------------------------

-- R1: 3 empatados en 1er lugar
-- select public.forzar_puntos_prueba('prueba001@test.local', 150);
-- select public.forzar_puntos_prueba('prueba002@test.local', 150);
-- select public.forzar_puntos_prueba('prueba003@test.local', 150);
-- select public.forzar_puntos_prueba('prueba004@test.local', 140);

-- R3: empate solo en 3er lugar
-- select public.forzar_puntos_prueba('prueba001@test.local', 150);
-- select public.forzar_puntos_prueba('prueba002@test.local', 140);
-- select public.forzar_puntos_prueba('prueba003@test.local', 130);
-- select public.forzar_puntos_prueba('prueba004@test.local', 130);
-- select public.forzar_puntos_prueba('prueba005@test.local', 125);

-- ---------------------------------------------------------------------------
-- Ver el ranking resultante
-- ---------------------------------------------------------------------------
select nombre_completo, puntos_totales
from public.ranking
order by puntos_totales desc
limit 10;

-- Nota: cuando termines de probar, puedes correr simular_resultados.sql de
-- nuevo para restaurar puntos "reales", o limpiar_datos_prueba.sql para borrar todo.
