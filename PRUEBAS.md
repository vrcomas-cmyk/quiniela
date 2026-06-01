# Guía de pruebas con 100 usuarios

Esta guía explica cómo poblar tu base de datos con datos de prueba para validar
toda la aplicación antes del Mundial. Todos los scripts están en `supabase/`.

**Validado:** estos scripts se probaron contra PostgreSQL 16 real. Crean 100 usuarios,
7,200 pronósticos de partido, pronósticos de clasificación completos, calculan puntos
vía trigger, y pueblan el ranking correctamente.

## Resumen de scripts

| Script | Qué hace |
|--------|----------|
| `datos_prueba.sql` | Crea 100 usuarios de prueba con pronósticos aleatorios |
| `simular_resultados.sql` | Carga resultados oficiales aleatorios y recalcula puntos |
| `datos_prueba_eliminatorias.sql` | Genera partidos y pronósticos de 16vos → final |
| `simular_resultados_eliminatorias.sql` | Carga resultados de eliminatorias y recalcula |
| `forzar_empates.sql` | Fuerza escenarios de empate para probar la calculadora de premios |
| `limpiar_eliminatorias_prueba.sql` | Borra solo los partidos de prueba de eliminatorias |
| `limpiar_datos_prueba.sql` | Borra TODOS los datos de prueba (usuarios y todo) |

## Orden de ejecución

Todos se ejecutan en **Supabase → SQL Editor → New Query** (pegar y Run).

### 1. Poblar usuarios y pronósticos

```
Ejecutar: datos_prueba.sql
```

Crea 100 usuarios identificables por email `prueba001@test.local` … `prueba100@test.local`.
Cada uno con:
- Pronósticos para los 72 partidos de fase de grupos (marcadores 0–4 aleatorios)
- 1° y 2° de cada uno de los 12 grupos
- 8 terceros aleatorios
- Top 4 final aleatorio
- 80% marcados como pagados, 20% pendientes

Al terminar verás `usuarios_prueba = 100` y `pronosticos_partido_prueba = 7200`.

> Los usuarios de prueba tienen contraseña `prueba123` pero **no están pensados para
> login** (son para poblar datos). Si quisieras entrar como uno, técnicamente podrías
> con ese password, pero el propósito es ver el ranking y las pantallas con datos.

### 2. Simular resultados oficiales

```
Ejecutar: simular_resultados.sql
```

Carga marcadores oficiales aleatorios para los 72 partidos. El trigger recalcula
automáticamente los puntos de los 7,200 pronósticos. También carga la clasificación
oficial (1°/2° de cada grupo, 8 terceros, top 4) y recalcula esos puntos.

Al final muestra el top 20 del ranking. Deberías ver puntajes realistas
(alrededor de 100–130 puntos los punteros, comparable a la quiniela de Qatar).

Ahora puedes navegar la app:
- **Ranking**: verás los 100 usuarios ordenados
- **Comunidad**: con los partidos cerrados, verás la matriz de pronósticos
- **Admin → Premios**: calcula el reparto del bote

### 2b. Generar y probar las fases eliminatorias

En el Mundial real, los partidos de 16vos en adelante se crean conforme avanza el
torneo (no se conocen los cruces de antemano). Para **probar** que todas las fases
funcionan, hay un par de scripts que las generan con equipos aleatorios:

```
Ejecutar: datos_prueba_eliminatorias.sql
```

Esto crea los partidos de prueba de las 6 fases eliminatorias (16 + 8 + 4 + 2 + 1 + 1
= 32 partidos), publica esas fases, abre la ventana de pronósticos, y genera los
pronósticos de los 100 usuarios. Los partidos se marcan con sede `(PRUEBA)` para
poder borrarlos después sin tocar nada real.

```
Ejecutar: simular_resultados_eliminatorias.sql
```

Carga marcadores oficiales aleatorios para esos partidos. El trigger recalcula con
la puntuación correcta de cada fase (6/3 en rondas, 8/4 en la final). Al final
muestra el desglose por fase del top 10, igual que el archivo de Qatar:
`grupos | r16vos | octavos | cuartos | semis | finales | total`.

Con esto puedes navegar **Mis Pronósticos** seleccionando cada fase, ver la
**Comunidad** de cada ronda, y confirmar que el ranking suma todo correctamente.

Para borrar SOLO las eliminatorias de prueba (dejando intacta la fase de grupos):

```
Ejecutar: limpiar_eliminatorias_prueba.sql
```

Esto borra los 32 partidos de prueba (y sus pronósticos en cascada) y revierte las
fases eliminatorias a "no publicada" sin fechas, como recién instaladas. **Verificado:**
no toca los 72 partidos de grupos ni sus 7,200 pronósticos.

### 3. (Opcional) Probar la calculadora de premios con empates

Los pronósticos aleatorios rara vez producen empates exactos. Para probar las reglas
de empate del reglamento:

```
Ejecutar: forzar_empates.sql
```

Por defecto fuerza el **escenario R2** (el que comentaste): 1 líder con 140 puntos
y 3 empatados en 2° lugar con 139 puntos. Luego:

1. Ve a **Admin → 💰 Premios**
2. Confirma: 100 participantes pagados × $400 = $40,000, aporte fijo $1,500
3. Click "Calcular reparto"
4. Deberías ver:
   - **Fernando Rodríguez (1°, 140 pts): 60% = $23,100**
   - **3 empatados (2°, 139 pts): 13.33% c/u = $5,133.33 c/u**
   - 3°, 4°, 5° desiertos

El archivo tiene comentados otros escenarios (R1, R3) que puedes descomentar
para probar otros casos de empate.

### 4. Limpiar todo

Cuando termines de probar y antes de lanzar en producción:

```
Ejecutar: limpiar_datos_prueba.sql
```

Borra los 100 usuarios y, en cascada, todos sus pronósticos, puntos y bonus.
Verificado: deja `profiles` y `pronosticos_partido` en 0 para los usuarios de prueba.

Si también quieres resetear los marcadores oficiales que cargó `simular_resultados.sql`,
descomenta las líneas indicadas dentro de `limpiar_datos_prueba.sql`.

## Validación contra Qatar 2022

Revisé el archivo de la quiniela de Qatar 2022 que compartiste y confirmé que
nuestro modelo coincide:

- **Estructura de puntos idéntica**: marcador exacto + acierto resultado, más
  puntos por 1°/2° de grupo, terceros, y top 4 — exactamente como en las hojas
  de Excel de Qatar.
- **Ejemplo real**: el ganador de Qatar (Fidel Medina, 151 pts) tenía 112 pts en
  fase de grupos = 66 (marcadores) + 38 (posiciones de grupo) + 8 (top 4). Nuestra
  lógica reproduce esta misma descomposición.
- **Tiempos extra / penales**: la final Argentina–Francia se registró 3–3 (sin
  contar penales), confirmando que el marcador oficial excluye la definición por
  penales, tal como está documentado en la app.
- **Empates en ranking**: Qatar tuvo varios empates (tres jugadores en "3er lugar"
  con 141 pts), justo el caso que la calculadora de premios maneja.

## Notas técnicas

- Los usuarios de prueba se insertan directamente en `auth.users` con una fila
  mínima. Esto funciona en Supabase porque `profiles` tiene FK a `auth.users`.
- El campo `pagado` se asigna 80/20 para que puedas probar el filtro "solo pagados"
  en la calculadora de premios.
- Si corres `datos_prueba.sql` dos veces, el `on conflict do nothing` evita duplicados,
  pero los emails ya existirían; mejor corre limpieza primero si quieres regenerar.
