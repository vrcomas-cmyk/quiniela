# Guía de actualización v2

Esta actualización agrega:
- ✅ Crear/invitar usuarios desde el panel admin con link de activación
- ✅ Importar usuarios masivamente desde CSV/Excel
- ✅ Eliminar usuarios (con doble confirmación)
- ✅ Editar textos visibles de la app (reglas, bienvenida, premios) desde admin
- ✅ Eliminar resultados de partidos con confirmación
- ✅ Página pública `/invite?token=xxx` para que los usuarios activen su cuenta
- ✅ Premios oficiales corregidos (35/25/20/15/5)

## Pasos para desplegar

### 1. Ejecutar la migración SQL

En **Supabase → SQL Editor → New Query**, pega el contenido de `supabase/migracion_02.sql` y dale **Run**.

Esto crea las tablas `configuracion` e `invitaciones`, y siembra los textos iniciales editables. Es seguro re-ejecutarla.

### 2. Desplegar la Edge Function `admin-users`

La Edge Function corre código del servidor con privilegios elevados (necesarios para crear/eliminar usuarios). Hay dos formas de desplegarla:

#### Opción A: Con Supabase CLI (recomendada)

```bash
# Instalar el CLI si no lo tienes
npm install -g supabase

# Loguear con tu cuenta
supabase login

# Vincular tu proyecto local con tu proyecto remoto (ya tienes la URL en .env)
# Reemplaza <project-ref> por el identificador de tu proyecto (parte de la URL antes de .supabase.co)
supabase link --project-ref <project-ref>

# Desplegar la función
supabase functions deploy admin-users --no-verify-jwt
```

El flag `--no-verify-jwt` es necesario porque la acción `activar` debe ser pública (los invitados aún no tienen sesión cuando activan su cuenta). La función verifica internamente que las demás acciones sí sean de admin.

#### Opción B: Desde el dashboard de Supabase

1. Ve a **Supabase → Edge Functions → Create a new function**
2. Nombre: `admin-users`
3. Copia el contenido de `supabase/functions/admin-users/index.ts` y pégalo
4. **Importante:** En **Settings**, desactiva "Verify JWT" (porque la activación es pública)
5. Deploy

### 3. (Opcional) Variables de entorno de la función

La Edge Function usa automáticamente las siguientes variables (Supabase las inyecta sola, no necesitas configurarlas):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Si por alguna razón no se inyectan automáticamente, agrégalas manualmente en **Edge Functions → admin-users → Secrets**.

### 4. Reiniciar el frontend

```bash
# Local
npm run dev

# O hacer push a GitHub y Vercel se reconstruye solo
```

## Cómo usar las nuevas features

### Invitar un usuario individual

1. Admin → ✉ Invitaciones
2. Captura nombre y email → "Crear invitación"
3. En la tabla de "Invitaciones recientes" → "📋 Copiar link"
4. Pega el link en WhatsApp/email y mándalo al usuario
5. El usuario abre el link, crea su contraseña, y queda dentro

### Importar usuarios masivamente (CSV)

1. En Excel, prepara dos columnas: nombre y email
2. Selecciona las celdas (sin encabezados) → Copiar
3. Admin → ✉ Invitaciones → pega en el textarea de "Importar desde CSV / Excel"
4. "Crear invitaciones masivas"
5. Aparecen los resultados con un botón "Copiar link" por cada uno

**Formato aceptado** (uno por línea):
```
Juan Pérez, juan@empresa.com
María López, maria@empresa.com
```

También funcionan separadores `;` y tabuladores (Excel directo). El primer renglón se ignora si parece un encabezado.

### Eliminar un usuario

1. Admin → 👥 Usuarios
2. Botón "🗑 Eliminar" en la fila
3. Primera confirmación: alert con el detalle de qué se borrará
4. Segunda confirmación: escribir el primer nombre del usuario
5. Si confirmas correctamente, se borra todo (cuenta, profile, pronósticos)

### Eliminar un resultado oficial

1. Admin → ⚽ Resultados oficiales
2. Botón 🗑 al lado del partido que tiene resultado
3. Confirmación con el número de pronósticos afectados
4. Si confirmas, el marcador se pone en blanco y los puntos vuelven a 0 automáticamente

### Editar textos visibles

1. Admin → ⚙ Configuración
2. Hay 3 textos editables iniciales:
   - `reglas_puntuacion`: el bloque "Cómo se ganan los puntos" en Home
   - `texto_bienvenida`: el mensaje bajo el saludo
   - `texto_premios`: el resumen de distribución de premios
3. Edita en Markdown simple
4. Botón "👁 Vista previa" para ver cómo se verá
5. "Guardar"

**Markdown soportado:**
- `# Título principal`
- `## Sub-título`
- `### Apartado`
- `**negrita**`
- `*itálica*`
- `- viñeta` (o `* viñeta`)

## Notas importantes

- Las invitaciones expiran a los **30 días** automáticamente.
- Una invitación no usada se puede re-copiar mientras siga vigente.
- Si intentas invitar un email ya invitado y vigente, el sistema devuelve la misma invitación existente (no duplica).
- Si intentas invitar un email ya registrado, lo rechaza.
- **No puedes eliminarte a ti mismo** (la función rechaza tu propio user_id).
- Cuando eliminas un usuario, todas sus FKs caen en cascada (profile, pronosticos_partido, pronosticos_clasificacion, bonus_otorgados). Los puntos del ranking se reajustan solos.
