# Guía: 3 quinielas independientes

Cómo tener 3 quinielas totalmente aisladas (una interna y dos externas), cada una
con sus propios jugadores, ranking, costo y premios, **sin recapturar resultados
tres veces a mano**.

## Concepto

Cada quiniela = **1 proyecto Supabase + 1 proyecto Vercel**, todas usando el MISMO
código. Como son bases de datos físicamente distintas, el aislamiento es total:
un jugador de una quiniela no puede ver ni tocar las otras de ninguna forma.

```
                 mismo repositorio de GitHub
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  Vercel #1          Vercel #2          Vercel #3
  (interna)          (externa 1)        (externa 2)
        │                 │                 │
        ▼                 ▼                 ▼
  Supabase #1        Supabase #2        Supabase #3
  ranking propio     ranking propio     ranking propio
  costo propio       costo propio       costo propio
```

## Montaje de cada quiniela (repite para las 2 externas)

### 1. Proyecto Supabase nuevo
- supabase.com → New Project → nómbralo distinto (ej. `quiniela-externa-1`)
- Guarda la contraseña de la base

### 2. Cargar el esquema (SQL Editor), en este orden:
```
schema.sql
migracion_02.sql
migracion_03.sql
```
Esto deja la base idéntica a la interna, con los 72 partidos de grupos ya sembrados.

### 3. Edge Functions (si usará invitaciones por correo)
```
supabase functions deploy admin-users --no-verify-jwt
supabase functions deploy procesar-correos
supabase functions deploy cron-tareas
```
Y sus secrets de Resend (`RESEND_API_KEY`, `CORREO_REMITENTE`, `URL_APP`).

### 4. Proyecto Vercel nuevo
- Vercel → Add New Project → importa **el mismo repositorio de GitHub**
  (Vercel permite varios proyectos del mismo repo, sin problema)
- En Environment Variables pon las credenciales de **esta** base Supabase nueva:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Deploy → obtienes una URL distinta (ej. `quiniela-externa-1.vercel.app`)

### 5. Auth y cron de esta base
- Supabase → Authentication → URL Configuration → Site URL = la nueva URL de Vercel
- Corre `configurar_cron.sql` con el project-ref y service key de ESTA base

### 6. Configura su costo y premios
- Entra al panel admin de esa quiniela
- Admin → 💵 Pagos → ajusta "Costo de la quiniela"
- La calculadora de premios usa ese costo automáticamente

Listo. Cada quiniela queda con su propio link, sus propios jugadores y su propio bote.

---

## Capturar resultados UNA sola vez y replicar

Para no capturar los 72 marcadores en cada base, usa `sincronizar_resultados.sql`:

### Flujo
1. **Captura normal** en tu base "maestra" (la interna), desde el panel admin como
   siempre: Resultados oficiales + Clasificación oficial.

2. En el **SQL Editor de la maestra**, ejecuta `sincronizar_resultados.sql`.
   Este script NO modifica nada: solo **genera texto SQL** en dos consultas:
   - La primera columna (`sql_para_replicar`) son los UPDATE de marcadores.
   - La segunda (`sql_clasificacion_para_replicar`) es la clasificación oficial.

3. **Copia** el contenido de esas celdas de resultado.

4. **Pégalo y ejecútalo** en el SQL Editor de las otras dos bases.

Al aplicarse, el trigger de cada base recalcula los puntos de sus propios jugadores
automáticamente. Verificado: los marcadores y la clasificación se replican idénticos
porque las 3 bases comparten el mismo seed (mismos equipos, mismos números de partido).

### Cada cuándo
Lo corres cuando termina una jornada/fase y ya capturaste resultados. Toma ~1 minuto
por base (copiar y pegar), en vez de recapturar 72 marcadores.

---

## Lo que NO se comparte (y está bien que así sea)

- **Jugadores**: cada base tiene los suyos. Una invitación solo sirve para la quiniela
  de la que salió.
- **Ranking**: independiente por base.
- **Pagos y premios**: independientes; cada quiniela su bote.
- **Textos editables, fechas de apertura/cierre**: independientes (puedes abrir fases
  en horarios distintos por quiniela si quieres).

## Lo que SÍ replicas con el script

- Marcadores oficiales de partidos.
- Clasificación oficial (1°/2° por grupo, terceros, top 4).

## Consejo operativo

Marca claramente cuál base es la "maestra" (la que capturas primero). Sugerencia:
la interna. Y guarda las 3 URLs + sus paneles admin en un documento, porque tendrás
que entrar a los 3 paneles para abrir/cerrar fases (esos horarios no se sincronizan,
los pones en cada uno).
