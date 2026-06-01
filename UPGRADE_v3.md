# Guía de actualización v3

Esta actualización agrega:
- ✅ **Correos automáticos** de invitación y recordatorios (vía Resend)
- ✅ **Pagos en parcialidades** (abonos parciales hasta liquidar)
- ✅ **Bloqueo de pronósticos antes de la apertura** de cada fase
- ✅ **Publicación automática** de fases X horas antes de la apertura
- ✅ **Recordatorios automáticos** 24h y 2h antes del cierre a quienes no han pronosticado
- ✅ **Reporte "quién no ha pronosticado"** por fase
- ✅ **Contador "llevas X de Y"** con barra de progreso en Mis Pronósticos
- ✅ **Exportar toda la quiniela a Excel** (ranking, pagos, progreso)
- ✅ **Validación anti-duplicado** en clasificación (no repetir equipo en 1°/2°, top 4, terceros)

---

## Orden de despliegue

### 1. Migración SQL

En **Supabase → SQL Editor → New Query**, pega y ejecuta `supabase/migracion_03.sql`.

Crea las tablas `pagos`, `correos_cola`, `recordatorios_enviados`; las vistas `estado_pagos`
y `progreso_pronosticos`; la columna `publicar_horas_antes` en `fases`; y refuerza la lógica
de bloqueo y validaciones. Es seguro re-ejecutarla.

### 2. Configurar Resend (envío de correos)

Resend es el servicio que manda los correos. Tiene capa gratuita de 3,000 correos/mes
(suficiente para 100 participantes).

**a) Crear cuenta y API key**

1. Entra a https://resend.com y crea una cuenta
2. Ve a **API Keys → Create API Key**, cópiala (empieza con `re_...`)

**b) Verificar un dominio (recomendado para no caer en spam)**

Sin dominio verificado, puedes enviar SOLO desde `onboarding@resend.dev`, y esos correos
suelen caer en spam. Para los 100 participantes conviene verificar el dominio de DEGASA:

1. En Resend → **Domains → Add Domain**, escribe tu dominio (ej. `degasa.com` o un subdominio
   como `quiniela.degasa.com`)
2. Resend te muestra unos registros DNS (SPF, DKIM, y a veces DMARC) — son tipo TXT y CNAME
3. Pídele a quien administra el DNS de DEGASA que agregue esos registros
4. Cuando Resend confirme la verificación (puede tardar de minutos a unas horas), ya podrás
   enviar desde `quiniela@degasa.com`

> Si no puedes verificar dominio ahora, arranca con `onboarding@resend.dev` y avísale a la
> gente que revise spam. Puedes cambiar el remitente después sin tocar código (es un secret).

**c) Configurar los secrets en Supabase**

En **Supabase → Edge Functions → Manage secrets** (o vía CLI), agrega:

| Secret | Valor |
|--------|-------|
| `RESEND_API_KEY` | la API key que copiaste (`re_...`) |
| `CORREO_REMITENTE` | `Quiniela DEGASA <quiniela@tudominio.com>` (o `onboarding@resend.dev` si aún no verificas dominio) |
| `URL_APP` | la URL pública de tu app en Vercel, ej. `https://quiniela-degasa.vercel.app` |

### 3. Desplegar las Edge Functions nuevas

Con el Supabase CLI (ya logueado y con el proyecto vinculado):

```bash
supabase functions deploy admin-users --no-verify-jwt
supabase functions deploy procesar-correos
supabase functions deploy cron-tareas
```

- `admin-users` se re-despliega porque ahora encola el correo de invitación automáticamente.
- `procesar-correos` envía la cola de correos vía Resend.
- `cron-tareas` publica fases, encola recordatorios y procesa correos.

> Alternativa sin CLI: créalas desde el dashboard (Edge Functions → Create function), pega
> el contenido de cada `index.ts`, y deja "Verify JWT" activado salvo en `admin-users`.

### 4. Programar el cron

En **SQL Editor**, abre `supabase/configurar_cron.sql`, reemplaza los dos placeholders:

- `<PROJECT_REF>` → el ref de tu proyecto (la parte de la URL antes de `.supabase.co`)
- `<SERVICE_ROLE_KEY>` → tu service_role key (**Settings → API → service_role**, es secreta)

Y ejecútalo. Esto programa que cada 15 minutos corra `cron-tareas`.

Para verificar que quedó activo:
```sql
select jobname, schedule, active from cron.job where jobname = 'quiniela-cron-tareas';
```

### 5. Frontend

```bash
npm install   # instala la nueva dependencia (xlsx)
npm run dev   # local
# o push a GitHub y Vercel reconstruye solo
```

---

## Cómo usar lo nuevo

### Pagos en parcialidades (Admin → 💵 Pagos)

- Arriba ves el total recaudado, cuántos liquidaron, y puedes ajustar el **costo de la quiniela**.
- Cada participante muestra cuánto ha pagado y su saldo.
- "Abonos / +Pago" despliega el historial de abonos y un formulario para registrar uno nuevo
  (monto, método, nota). Al llegar al costo total, queda **Liquidado** automáticamente.
- El flag legacy "pagado" se sincroniza solo, así que el resto de la app sigue funcionando.

### Publicación automática (Admin → ⏱ Fases)

- En cada fase hay un campo nuevo: **"Publicar auto. (horas antes de apertura)"**.
- Si pones, por ejemplo, `12`, la fase se publica sola 12 horas antes de su fecha de apertura
  (el cron lo revisa cada 15 min). La gente la ve venir, pero no puede pronosticar hasta la apertura.

### Bloqueo antes de apertura

- Ya no se necesita hacer nada: si una fase tiene `fecha_apertura` en el futuro, nadie puede
  guardar pronósticos aunque la fase esté visible. Esto está reforzado a nivel de base de datos.

### Recordatorios automáticos

- Cuando una fase abierta está a ~24h y a ~2h de cerrar, el cron encola un correo a cada
  jugador **que aún no completó** sus pronósticos de esa fase. Cada quien recibe máximo un
  recordatorio por momento (no se duplican).

### Reporte y exportación (Admin → 📊 Reporte)

- **Exportar a Excel**: descarga un archivo con hojas de Ranking (con desglose por fase),
  Pagos, y Progreso de pronósticos — similar al respaldo de Qatar 2022.
- **Quién ha pronosticado**: elige una fase y ve quién va completo y a quién le falta, para
  darle el último empujón por WhatsApp antes del cierre.

### Contador de progreso (jugador → Mis Pronósticos)

- En la cabecera de cada fase, el jugador ve "Llevas 45 de 72 partidos" con barra de progreso,
  para que nadie crea que terminó cuando le faltan.

---

## Notas importantes

- **Los recordatorios y la publicación automática dependen del cron.** Si no corres
  `configurar_cron.sql`, esas dos funciones no se ejecutan solas (todo lo demás sí funciona).
- **Si aún no configuras Resend**, el sistema NO truena: los correos se encolan y se quedan
  esperando. Cuando configures `RESEND_API_KEY`, se enviarán en la siguiente corrida del cron
  (o cuando le des "Enviar correos pendientes ahora" en Invitaciones).
- **La validación anti-duplicado** aplica también a los datos de prueba: el generador ya fue
  ajustado para elegir equipos distintos.
- Puedes forzar el envío de correos sin esperar el cron con el botón **"Enviar correos
  pendientes ahora"** en Admin → ✉ Invitaciones.
