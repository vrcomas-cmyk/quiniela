# Quiniela Mundial 2026 · DEGASA

App web full-stack para la quiniela interna del Mundial México · USA · Canadá 2026, organizada por DEGASA.

**Stack:** React 18 + TypeScript + Vite + TailwindCSS + Supabase (Auth + Postgres + RLS) + Vercel.

---

## Características

- Registro y login con email + contraseña (Supabase Auth)
- Pronósticos por partido (marcador exacto / acierto a ganador)
- Pronósticos de clasificación: 1° y 2° de cada grupo, los 8 mejores terceros, y top 4 final
- **Ranking en vivo** que se recalcula automáticamente cuando el admin captura resultados
- Vista de **Comunidad** que muestra los pronósticos de todos los jugadores, pero **solo después del cierre** de cada partido (protegido a nivel BD con Row Level Security)
- Panel de administración para:
  - Configurar fases (apertura/cierre, publicada)
  - Crear y editar partidos
  - Capturar resultados oficiales (los puntos se recalculan en automático)
  - Capturar clasificación oficial al cerrar la fase de grupos y al cerrar el torneo
  - Marcar usuarios como pagados y promoverlos a admin
- Countdown en tiempo real para fases abiertas
- Diseño responsive (móvil y desktop)

## Reglas de puntuación (según las bases oficiales)

| Fase | Marcador exacto | Acierto resultado |
|------|-----------------|-------------------|
| Fase de Grupos | 4 pts | 2 pts |
| Dieciseisavos a Semifinales | 6 pts | 3 pts |
| 3er Lugar | 6 pts | 3 pts |
| Gran Final | 8 pts | 4 pts |

**Clasificación** (se capturan durante la fase de grupos):
- 1° y 2° por grupo: **4 pts** en posición exacta, **2 pts** si solo aciertas que clasificó
- 8 mejores terceros: **2 pts** por cada uno acertado
- Top 4 final:
  - Campeón en posición exacta: **8 pts**
  - 2°, 3° y 4° en posición exacta: **5 pts** c/u
  - Solo en top 4 (posición errada): **3 pts**
  - **Bono:** 4 finalistas exactos en orden = **+5 pts**

**Premios:** 1° 40%, 2° 30%, 3° 20%, 4° 10% del bote total.

---

## Setup paso a paso

### 1. Crear proyecto en Supabase

1. Entra a https://supabase.com → New Project
2. Asigna un nombre (ej. `quiniela-mundial-2026`) y región (us-east o us-west)
3. Guarda la contraseña de la base de datos
4. Una vez creado, ve a **SQL Editor** → **New Query**
5. Copia y pega TODO el contenido de `supabase/schema.sql` y dale **Run**
   - Esto crea todas las tablas, funciones, políticas RLS, y siembra las 7 fases, los 12 grupos, y los 72 partidos de fase de grupos.

### 2. Obtener credenciales de Supabase

En tu proyecto Supabase, ve a **Settings → API**:
- Copia el **Project URL** → será `VITE_SUPABASE_URL`
- Copia la **anon public key** → será `VITE_SUPABASE_ANON_KEY`

> No uses la `service_role` key en el frontend. Solo `anon`.

### 3. Configurar la app localmente

```bash
# Clonar / descomprimir
cd quiniela-mundial-2026

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Edita .env y pega tu URL y anon key

# Correr en modo desarrollo
npm run dev
```

La app estará en http://localhost:5173

### 4. Crear tu cuenta de admin

1. Abre la app, regístrate con email + contraseña + nombre completo
2. En Supabase → **SQL Editor**, ejecuta:
   ```sql
   update public.profiles
      set rol = 'admin'
    where nombre_completo = 'Tu Nombre Completo';
   ```
3. Cierra sesión y vuelve a entrar. Ahora verás el botón **Admin** en la navbar.

### 5. Abrir la fase de grupos

1. Entra al panel **Admin → ⏱ Fases y horarios**
2. En "Fase de Grupos":
   - **Fecha apertura:** ahora mismo (o cuando quieras que la gente empiece a pronosticar)
   - **Fecha cierre:** algunos minutos antes del primer partido (ej. `2026-06-11 14:30` hora CDMX)
   - Checkbox **Publicada:** activado
3. Guarda. Listo: los jugadores ya pueden pronosticar.

### 6. Capturar resultados

Cuando termine cada partido:
1. **Admin → ⚽ Resultados oficiales** → selecciona la fase → captura el marcador → "Guardar"
2. Los puntos de todos los pronósticos de ese partido se recalculan automáticamente (trigger de BD).

Cuando termine la fase de grupos:
1. **Admin → 🏆 Clasif. oficial** → captura 1°/2° de cada grupo + los 8 terceros que avanzaron
2. Da "Guardar resultados oficiales y recalcular puntos"
3. Los puntos de clasificación se recalculan.

Cuando termine la final:
1. Vuelve a **🏆 Clasif. oficial** y captura el Top 4 final
2. Si alguien acertó los 4 en orden exacto, recibirá automáticamente el bono de +5 pts.

### 7. Crear partidos de las eliminatorias

Los 72 partidos de fase de grupos vienen pre-cargados. Cuando se definan los cruces de 16vos (al terminar la fase de grupos):

1. **Admin → ⏱ Fases** → activa "Publicada" en "Dieciseisavos de Final" y define apertura/cierre
2. **Admin → 🏟 Partidos** → selecciona la fase → crea cada partido con los equipos confirmados, fecha y sede
3. Repite para octavos, cuartos, semis, 3er lugar y final conforme avanza el torneo

---

## Deploy a Vercel

### 1. Subir a GitHub

```bash
git init
git add .
git commit -m "Quiniela Mundial 2026 - versión inicial"
git branch -M main
git remote add origin https://github.com/tu-usuario/quiniela-mundial-2026.git
git push -u origin main
```

### 2. Importar en Vercel

1. Entra a https://vercel.com → **Add New Project**
2. Importa el repositorio
3. Framework: **Vite** (lo detecta solo)
4. **Environment Variables** → agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. **Deploy**

Vercel te dará una URL pública (ej. `https://quiniela-mundial-2026.vercel.app`).

### 3. Configurar dominios autorizados en Supabase

Para que la autenticación funcione en producción:

1. Supabase → **Authentication → URL Configuration**
2. **Site URL:** tu URL de Vercel
3. **Redirect URLs:** agrega también tu URL local `http://localhost:5173` si seguirás desarrollando

---

## Estructura del proyecto

```
quiniela-mundial-2026/
├── supabase/
│   └── schema.sql          # Schema completo: tablas, RLS, triggers, seed
├── src/
│   ├── components/
│   │   ├── Countdown.tsx
│   │   ├── Layout.tsx
│   │   └── ProtectedRoute.tsx
│   ├── hooks/
│   │   ├── AuthContext.tsx
│   │   └── useAuth.tsx
│   ├── lib/
│   │   ├── fechas.ts       # date-fns helpers en español
│   │   └── supabase.ts     # Cliente Supabase
│   ├── pages/
│   │   ├── Admin.tsx
│   │   ├── Clasificacion.tsx
│   │   ├── Comunidad.tsx
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── MisPronosticos.tsx
│   │   └── Ranking.tsx
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.ts
├── vercel.json             # Rewrite SPA
└── .env.example
```

---

## Notas técnicas

### Seguridad: Row Level Security (RLS)

Toda la lógica crítica vive en la base de datos:

- **Un jugador NO puede ver los pronósticos de los demás antes del cierre** del partido. Esto está garantizado por la política `pronosticos_select_propios_o_cerrados` en Postgres, no solo por la UI.
- **Un jugador NO puede editar pronósticos de partidos ya cerrados**. La política `pronosticos_update_si_abierto` rechaza esas escrituras desde la BD.
- **Solo el admin puede capturar resultados oficiales y configurar fases**.
- **Un usuario no puede auto-promoverse a admin**. La política `profiles_update_self` valida que el rol no cambie.

### Recálculo automático de puntos

- Cuando el admin actualiza `goles_local_oficial` / `goles_visitante_oficial` en un partido, el trigger `trigger_recalcular_puntos` invoca `recalcular_puntos_partido()` para esa fila.
- La función usa `sign()` sobre `goles_local - goles_visitante` para detectar ganador/empate, lo cual maneja correctamente todos los casos (ganador local, empate, ganador visitante).
- Para clasificación, el admin invoca `recalcular_puntos_clasificacion()` desde el panel.

### Vistas

- `ranking`: agrega puntos de partidos + clasificación + bonus por jugador
- `ranking_por_fase`: útil si quieres mostrar quién va liderando cada fase

---

## Comandos útiles

```bash
npm run dev       # Servidor de desarrollo
npm run build     # Build de producción a dist/
npm run preview   # Preview del build
```

## Mejoras futuras (ideas)

- Notificaciones por email/WhatsApp 24 hrs antes del cierre de cada fase
- Importar resultados oficiales desde una API en lugar de capturarlos a mano
- Gráficas de evolución del ranking por fase
- Modo dark
- PWA (instalable como app en móvil)
- Histórico de quinielas anteriores

---

DEGASA · Quiniela #23 en la historia de los Mundiales.
