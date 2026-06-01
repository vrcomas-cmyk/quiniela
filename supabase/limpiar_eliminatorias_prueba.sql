-- =============================================================================
-- LIMPIAR PARTIDOS DE PRUEBA DE ELIMINATORIAS
-- =============================================================================
-- Borra SOLO los partidos de prueba de las fases eliminatorias (los marcados
-- con sede '(PRUEBA)'). Al borrar los partidos, sus pronósticos se eliminan en
-- cascada. NO toca la fase de grupos ni partidos reales que hayas capturado.
--
-- También revierte las fases eliminatorias a estado "no publicada" sin horarios,
-- para dejarlas como recién instaladas.
-- =============================================================================

-- 1. Borrar partidos de prueba (cascada borra sus pronósticos)
delete from public.partidos
where sede like '%(PRUEBA)'
  and fase_id in (
    select id from public.fases
    where codigo in ('16vos','8vos','4tos','semis','3er_lugar','final')
  );

-- 2. Revertir las fases eliminatorias a estado inicial (no publicadas, sin fechas)
update public.fases
  set publicada = false,
      fecha_apertura = null,
      fecha_cierre = null
where codigo in ('16vos','8vos','4tos','semis','3er_lugar','final');

-- =============================================================================
-- VERIFICACIÓN: debe devolver 0 partidos de prueba
-- =============================================================================
select count(*) as partidos_prueba_eliminatorias_restantes
from public.partidos
where sede like '%(PRUEBA)';

select nombre, publicada, fecha_apertura, fecha_cierre
from public.fases
where codigo in ('16vos','8vos','4tos','semis','3er_lugar','final')
order by orden;
