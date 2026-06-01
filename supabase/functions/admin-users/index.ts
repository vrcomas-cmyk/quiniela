// Edge Function: admin-users
//
// Acciones disponibles (POST a /functions/v1/admin-users con body JSON):
//
//  { action: 'invitar', email, nombre_completo }
//    → Solo admin. Crea una invitación con token único. Devuelve { token, link }
//
//  { action: 'invitar_masivo', usuarios: [{email, nombre_completo}, ...] }
//    → Solo admin. Crea varias invitaciones de una sola vez.
//    Devuelve { resultados: [{email, ok, token?, link?, error?}] }
//
//  { action: 'activar', token, password }
//    → Público. Activa la invitación creando el auth user con la contraseña dada.
//
//  { action: 'eliminar_usuario', user_id }
//    → Solo admin. Elimina el auth user (cascade borra profile + pronósticos).
//
// Cómo desplegar:
//   supabase functions deploy admin-users --no-verify-jwt
//
// (no-verify-jwt es necesario porque la acción 'activar' es pública)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Cliente admin (service role) - usado para crear/eliminar auth users
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body JSON inválido' }, 400);
  }

  const action = body?.action;
  if (!action) return json({ error: 'Falta action' }, 400);

  // ----------------------------------------------------------------------
  // Helper: verificar que quien llama es admin
  // ----------------------------------------------------------------------
  async function verificarAdmin(): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return { ok: false, status: 401, error: 'Falta Authorization header' };

    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return { ok: false, status: 401, error: 'No autenticado' };

    const { data: profile } = await userClient
      .from('profiles')
      .select('rol')
      .eq('id', user.id)
      .single();

    if (profile?.rol !== 'admin') {
      return { ok: false, status: 403, error: 'Se requiere rol admin' };
    }
    return { ok: true, userId: user.id };
  }

  // ----------------------------------------------------------------------
  // ACCIÓN: activar (PÚBLICA - no requiere ser admin)
  // ----------------------------------------------------------------------
  if (action === 'activar') {
    const { token: invToken, password } = body;
    if (!invToken || !password) return json({ error: 'Faltan token y password' }, 400);
    if (password.length < 6) return json({ error: 'Contraseña debe tener al menos 6 caracteres' }, 400);

    // Buscar la invitación
    const { data: inv, error: invErr } = await adminClient
      .from('invitaciones')
      .select('*')
      .eq('token', invToken)
      .is('usada_en', null)
      .single();

    if (invErr || !inv) return json({ error: 'Invitación inválida, ya usada, o expirada' }, 404);
    if (new Date(inv.expira_en) < new Date()) return json({ error: 'Invitación expirada' }, 410);

    // Crear el auth user con email_confirm=true para que no necesite verificación
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: { nombre_completo: inv.nombre_completo },
    });

    if (createErr || !newUser?.user) {
      return json({ error: `No se pudo crear el usuario: ${createErr?.message ?? 'desconocido'}` }, 500);
    }

    // Marcar invitación como usada (vía RPC para asegurar consistencia)
    const { error: redimirErr } = await adminClient.rpc('redimir_invitacion', {
      p_token: invToken,
      p_user_id: newUser.user.id,
    });

    if (redimirErr) {
      // Best-effort: el usuario ya está creado, intentamos al menos actualizar el profile
      await adminClient.from('profiles')
        .update({ nombre_completo: inv.nombre_completo })
        .eq('id', newUser.user.id);
    }

    return json({ ok: true, email: inv.email, nombre_completo: inv.nombre_completo });
  }

  // ----------------------------------------------------------------------
  // De aquí en adelante: requiere admin
  // ----------------------------------------------------------------------
  const adminCheck = await verificarAdmin();
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  // ----------------------------------------------------------------------
  // ACCIÓN: invitar
  // ----------------------------------------------------------------------
  if (action === 'invitar') {
    const { email, nombre_completo } = body;
    if (!email || !nombre_completo) return json({ error: 'Faltan email y nombre_completo' }, 400);

    const result = await crearInvitacion(adminClient, email, nombre_completo, adminCheck.userId, req);
    return json(result, result.ok ? 200 : 400);
  }

  // ----------------------------------------------------------------------
  // ACCIÓN: invitar_masivo
  // ----------------------------------------------------------------------
  if (action === 'invitar_masivo') {
    const { usuarios } = body;
    if (!Array.isArray(usuarios) || usuarios.length === 0) {
      return json({ error: 'Se requiere array usuarios' }, 400);
    }
    if (usuarios.length > 200) {
      return json({ error: 'Máximo 200 usuarios por carga' }, 400);
    }
    const resultados = [];
    for (const u of usuarios) {
      const r = await crearInvitacion(adminClient, u.email, u.nombre_completo, adminCheck.userId, req);
      resultados.push({ email: u.email, ...r });
    }
    return json({ resultados });
  }

  // ----------------------------------------------------------------------
  // ACCIÓN: eliminar_usuario
  // ----------------------------------------------------------------------
  if (action === 'eliminar_usuario') {
    const { user_id } = body;
    if (!user_id) return json({ error: 'Falta user_id' }, 400);
    if (user_id === adminCheck.userId) return json({ error: 'No puedes eliminar tu propia cuenta' }, 400);

    const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id);
    if (delErr) return json({ error: `No se pudo eliminar: ${delErr.message}` }, 500);

    // Los pronósticos y profile se borran en cascada por las FKs
    return json({ ok: true });
  }

  return json({ error: `Acción desconocida: ${action}` }, 400);
});

// Helper compartido
async function crearInvitacion(
  adminClient: any,
  email: string,
  nombre_completo: string,
  invitadoPor: string,
  req: Request
): Promise<{ ok: boolean; token?: string; link?: string; error?: string }> {
  if (!email || !email.includes('@')) return { ok: false, error: 'Email inválido' };
  if (!nombre_completo || nombre_completo.trim().length < 3) {
    return { ok: false, error: 'Nombre demasiado corto' };
  }

  // Verificar que no exista una invitación activa con ese email
  const { data: existente } = await adminClient
    .from('invitaciones')
    .select('id, token, expira_en')
    .eq('email', email)
    .is('usada_en', null)
    .gt('expira_en', new Date().toISOString())
    .maybeSingle();

  if (existente) {
    const origin = req.headers.get('origin') ?? '';
    return {
      ok: true,
      token: existente.token,
      link: `${origin}/invite?token=${existente.token}`,
      error: 'Ya existía una invitación activa para este email, se devuelve la misma',
    };
  }

  // Verificar que no haya un usuario ya creado con ese email
  const { data: { users } } = await adminClient.auth.admin.listUsers();
  if (users?.some((u: any) => u.email?.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'Ya existe un usuario registrado con ese email' };
  }

  // Generar token único
  const token = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);

  const { error: insErr } = await adminClient
    .from('invitaciones')
    .insert({ token, email, nombre_completo: nombre_completo.trim(), creada_por: invitadoPor });

  if (insErr) return { ok: false, error: insErr.message };

  const origin = req.headers.get('origin') ?? (Deno.env.get('URL_APP') ?? '');
  const link = `${origin}/invite?token=${token}`;

  // Encolar correo de invitación (se enviará cuando corra procesar-correos)
  try {
    await adminClient.from('correos_cola').insert({
      destinatario: email,
      nombre_destinatario: nombre_completo.trim(),
      asunto: '🎉 Te invitaron a la Quiniela Mundial 2026 (DEGASA)',
      cuerpo_html: plantillaInvitacion(nombre_completo.trim(), link),
      tipo: 'invitacion',
    });
  } catch (_e) {
    // Si falla el encolado, igual devolvemos el link para copiar manual
  }

  return { ok: true, token, link };
}

function plantillaInvitacion(nombre: string, link: string): string {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #0a5526, #053018); padding: 24px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 24px;">⚽ Quiniela Mundial 2026</h1>
      <p style="color: #dcf0de; margin: 8px 0 0;">México · USA · Canadá</p>
    </div>
    <div style="padding: 24px; background: #f0f9f1;">
      <p style="font-size: 16px;">Hola <b>${nombre}</b>,</p>
      <p style="font-size: 16px;">Te invitamos a participar en la Quiniela Mundialista de DEGASA. Activa tu cuenta y empieza a pronosticar:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${link}" style="background: #f97316; color: #fff; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
          Activar mi cuenta
        </a>
      </div>
      <p style="font-size: 13px; color: #666;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p style="font-size: 12px; color: #0a5526; word-break: break-all;">${link}</p>
      <p style="font-size: 12px; color: #999; margin-top: 24px;">Esta invitación expira en 30 días.</p>
    </div>
  </div>`;
}
