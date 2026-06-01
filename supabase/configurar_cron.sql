-- =============================================================================
-- CONFIGURACIÓN DE CRON (tareas automáticas)
-- =============================================================================
-- Ejecutar en Supabase SQL Editor UNA VEZ, después de desplegar las Edge
-- Functions cron-tareas y procesar-correos.
--
-- Programa que cada 15 minutos se ejecute la Edge Function cron-tareas, que:
--   - Publica fases programadas
--   - Encola recordatorios (24h y 2h antes del cierre)
--   - Procesa la cola de correos
--
-- IMPORTANTE: reemplaza los dos valores de abajo antes de ejecutar:
--   <PROJECT_REF>      = el ref de tu proyecto (parte de la URL antes de .supabase.co)
--   <SERVICE_ROLE_KEY> = tu service_role key (Settings → API → service_role)
--
-- (El service_role key es secreto; este cron lo guarda en la BD para poder
--  invocar la función. Solo el admin de la BD puede leer la config de cron.)
-- =============================================================================

-- Activar las extensiones necesarias (en Supabase ya suelen estar disponibles)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Eliminar el job previo si existe (para poder re-ejecutar este script)
select cron.unschedule('quiniela-cron-tareas')
where exists (select 1 from cron.job where jobname = 'quiniela-cron-tareas');

-- Programar: cada 15 minutos
select cron.schedule(
  'quiniela-cron-tareas',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-tareas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- =============================================================================
-- Verificar que el job quedó programado
-- =============================================================================
select jobid, jobname, schedule, active from cron.job where jobname = 'quiniela-cron-tareas';

-- =============================================================================
-- Para DESACTIVAR el cron más adelante (si lo necesitas):
--   select cron.unschedule('quiniela-cron-tareas');
--
-- Para ver el historial de ejecuciones:
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname='quiniela-cron-tareas')
--   order by start_time desc limit 20;
-- =============================================================================
