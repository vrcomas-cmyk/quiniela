-- =============================================================================
-- LIMPIEZA: borrar TODOS los datos de prueba
-- =============================================================================
-- Ejecutar cuando quieras eliminar los 100 usuarios de prueba y todo lo suyo.
--
-- Borra en cascada: al eliminar de auth.users, las FKs con "on delete cascade"
-- eliminan automáticamente sus profiles, pronosticos_partido,
-- pronosticos_clasificacion y bonus_otorgados.
-- =============================================================================

-- 1. Borrar usuarios de prueba (cascada borra todo lo asociado)
delete from auth.users where email like '%@test.local';

-- 2. (Opcional) Limpiar resultados oficiales simulados para volver a empezar
--    Descomenta si quieres también resetear los marcadores cargados:

-- update public.partidos
--   set goles_local_oficial = null, goles_visitante_oficial = null
--   where fase_id in (select id from public.fases where codigo = 'grupos');

-- delete from public.resultados_clasificacion;

-- =============================================================================
-- VERIFICACIÓN: debe devolver 0
-- =============================================================================
select count(*) as usuarios_prueba_restantes
from auth.users where email like '%@test.local';
