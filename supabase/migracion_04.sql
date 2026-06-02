-- =============================================================================
-- MIGRACIÓN 04: Premios configurables (porcentajes editables)
-- =============================================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de migracion_03.sql
-- Es seguro re-ejecutar.
--
-- Agrega las claves de configuración que controlan el reparto de premios:
--   - premios_porcentajes: arreglo de % por lugar (debe sumar 100)
--   - premios_aporte_fijo: monto fijo que se descuenta antes de repartir
--
-- Estos valores se editan desde Admin → 💰 Premios. Cada quiniela (cada base
-- de datos) tiene los suyos, así que puedes poner distinto número de lugares y
-- porcentajes en cada una.
-- =============================================================================

insert into public.configuracion (clave, valor, descripcion) values
  ('premios_porcentajes', '[35,25,20,15,5]',
   'Porcentajes de premio por lugar (JSON o CSV). La cantidad de valores = número de lugares premiados. Debe sumar 100.'),
  ('premios_aporte_fijo', '1500',
   'Monto fijo que se descuenta del bote antes de repartir premios.')
on conflict (clave) do nothing;

-- Actualizar el texto visible de premios para que sea editable y coherente.
-- (Si ya lo personalizaste, esta línea no lo sobreescribe por el ON CONFLICT.)
insert into public.configuracion (clave, valor, descripcion) values
  ('texto_premios',
   'Premios: 1° 35% · 2° 25% · 3° 20% · 4° 15% · 5° 5% del bote total',
   'Texto de premios mostrado en el ranking y la portada')
on conflict (clave) do nothing;

-- =============================================================================
-- FIN MIGRACIÓN 04
-- =============================================================================
