-- =============================================================================
-- DATOS DE PRUEBA: 100 usuarios ligeros con pronósticos aleatorios
-- =============================================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de schema.sql (y migracion_02 si aplica)
--
-- Crea 100 usuarios identificables por email @test.local con:
--   - Pronósticos aleatorios para los 72 partidos de fase de grupos
--   - Pronósticos de clasificación (1°/2° por grupo, 8 terceros, top 4)
--   - Algunos marcados como pagados, otros no
--
-- TODO queda etiquetado para borrarse fácil (ver bloque de limpieza al final).
--
-- NOTA: Inserta directamente en auth.users (filas mínimas). Estos usuarios
-- NO pueden iniciar sesión (no tienen contraseña usable); son solo para
-- poblar el ranking y probar la lógica. Para borrarlos, usa el script de
-- limpieza al final de este archivo.
-- =============================================================================

-- Asegurar extensión para gen_random_uuid / crypt
create extension if not exists pgcrypto;

do $$
declare
  v_user_id uuid;
  v_email text;
  v_nombre text;
  v_partido record;
  v_grupo record;
  v_gl int;
  v_gv int;
  i int;
  v_nombres text[] := array[
    'Fernando Rodríguez','Patricia Zumaya','Javier Alva','Eric Contla','Ricardo Guerrero',
    'Andrea Soto','Ma. Elena Chávez','Istar Velázquez','Ana Gutiérrez','Zuri López',
    'Heriberto Lara','José Luis Yáñez','Brenda Solis','Alberto Pérez','Brenda González',
    'Fidel Medina','Osbaldo Benítez','Carlos Rodríguez','Arturo Castro','Roberto Soriano',
    'Cecilia Sánchez','Andrea Díaz','Sandra Carbajal','Alfredo Agoitia','Gonzalo Mendiola',
    'Verónica Campos','Mónica de la Rosa','Diana Quiroz','Patricia Ramírez','Daniela Juárez',
    'Oscar Martínez','Armando Pérez','Rubén Uribe','Ricardo Rubio','Alejandra Gallegos',
    'Jesús Moreno','Osvaldo Flores','Sandra Picazo','Cruz Zumaya','Carlos Alemán',
    'Daniel Amos','Karina Cervera','Leticia Mendoza','Grisel Baza','Aldo Picazo',
    'Mario Delgado','Lucía Fuentes','Hugo Estrada','Paola Vega','Raúl Cordero',
    'Silvia Ibarra','Tomás Reyna','Norma Lozano','Iván Tapia','Beatriz Nava',
    'Gerardo Pineda','Adriana Solís','Felipe Cano','Rosa Mejía','Sergio Bravo',
    'Claudia Ríos','Marcos Téllez','Elena Vázquez','Pablo Quintero','Diana Salas',
    'Jorge Lara','Verónica Olvera','Andrés Mota','Karla Domínguez','Esteban Ruiz',
    'Lorena Casas','Víctor Mena','Gabriela Peña','Rodrigo Lira','Mariana Cruz',
    'Alan Zúñiga','Daniela Rangel','Emilio Cuevas','Fátima Robles','Nicolás Arce',
    'Renata Gil','Saúl Bautista','Ximena Paredes','Bruno Acosta','Carmen Téllez',
    'Diego Salinas','Ana Lía Romo','Federico Núñez','Itzel Maya','Joaquín Ferrer',
    'Liliana Cuéllar','Mateo Solano','Olivia Bañuelos','Pedro Galván','Regina Ávila',
    'Salvador Pino','Talía Esquivel','Ulises Mora','Valeria Cano','Wendy Salgado',
    'Yael Montes'
  ];
begin
  for i in 1..100 loop
    v_user_id := gen_random_uuid();
    v_email := 'prueba' || lpad(i::text, 3, '0') || '@test.local';
    v_nombre := coalesce(v_nombres[i], 'Jugador Prueba ' || i);

    -- Insertar en auth.users (fila mínima; instance_id e id son obligatorios)
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', v_email,
      crypt('prueba123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      json_build_object('nombre_completo', v_nombre),
      now(), now()
    )
    on conflict (id) do nothing;

    -- El trigger handle_new_user crea el profile, pero por si acaso lo aseguramos:
    insert into public.profiles (id, nombre_completo, rol, pagado)
    values (v_user_id, v_nombre, 'jugador', (i % 5 <> 0))  -- 80% pagados, 20% no
    on conflict (id) do update set nombre_completo = excluded.nombre_completo;

    -- Pronósticos de partidos: marcadores aleatorios 0..4 para CADA partido de grupos
    for v_partido in
      select p.id from public.partidos p
      join public.fases f on f.id = p.fase_id
      where f.codigo = 'grupos'
    loop
      v_gl := floor(random() * 5)::int;  -- 0..4
      v_gv := floor(random() * 5)::int;
      insert into public.pronosticos_partido (user_id, partido_id, goles_local, goles_visitante)
      values (v_user_id, v_partido.id, v_gl, v_gv)
      on conflict (user_id, partido_id) do nothing;
    end loop;

    -- Pronósticos de clasificación: 1° y 2° de cada grupo (equipos reales de ese grupo, distintos)
    for v_grupo in
      select id from public.grupos order by codigo
    loop
      declare
        v_eq1 text;
        v_eq2 text;
      begin
        select equipo into v_eq1 from (
          select equipo_local as equipo from public.partidos where grupo_id = v_grupo.id
          union
          select equipo_visitante from public.partidos where grupo_id = v_grupo.id
        ) q order by random() limit 1;

        select equipo into v_eq2 from (
          select equipo_local as equipo from public.partidos where grupo_id = v_grupo.id
          union
          select equipo_visitante from public.partidos where grupo_id = v_grupo.id
        ) q where equipo <> v_eq1 order by random() limit 1;

        if v_eq1 is not null then
          insert into public.pronosticos_clasificacion (user_id, tipo, grupo_id, posicion, equipo)
          values (v_user_id, 'clasif_grupo', v_grupo.id, 1, v_eq1);
        end if;
        if v_eq2 is not null then
          insert into public.pronosticos_clasificacion (user_id, tipo, grupo_id, posicion, equipo)
          values (v_user_id, 'clasif_grupo', v_grupo.id, 2, v_eq2);
        end if;
      end;
    end loop;

    -- 8 terceros aleatorios (equipos distintos del torneo)
    insert into public.pronosticos_clasificacion (user_id, tipo, equipo)
    select v_user_id, 'tercero', e.equipo
    from (
      select equipo from (
        select distinct equipo from (
          select equipo_local as equipo from public.partidos
          union
          select equipo_visitante from public.partidos
        ) q
      ) distintos order by random() limit 8
    ) e;

    -- Top 4 final aleatorio
    insert into public.pronosticos_clasificacion (user_id, tipo, posicion, equipo)
    select v_user_id, 'top4', row_number() over (), e.equipo
    from (
      select equipo from (
        select distinct equipo from (
          select equipo_local as equipo from public.partidos
          union
          select equipo_visitante from public.partidos
        ) q
      ) distintos order by random() limit 4
    ) e;

  end loop;

  raise notice 'Creados 100 usuarios de prueba con pronósticos.';
end $$;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
select count(*) as usuarios_prueba
from auth.users where email like '%@test.local';

select count(*) as pronosticos_partido_prueba
from public.pronosticos_partido pp
join auth.users u on u.id = pp.user_id
where u.email like '%@test.local';
