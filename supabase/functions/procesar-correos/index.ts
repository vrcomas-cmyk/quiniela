// Edge Function: procesar-correos
//
// Procesa la cola public.correos_cola enviando los correos pendientes vía Resend.
// La llama el cron (cron-tareas) periódicamente, o el admin manualmente.
//
// Variables de entorno requeridas (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   - API key de Resend (https://resend.com)
//   CORREO_REMITENTE - email verificado en Resend, ej. "Quiniela DEGASA <quiniela@tudominio.com>"
//
// Despliegue:
//   supabase functions deploy procesar-correos
//
// Nota: si no hay RESEND_API_KEY configurada, la función responde sin enviar
// (modo "dry run") para que el sistema no truene; los correos quedan en cola.

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const CORREO_REMITENTE = Deno.env.get('CORREO_REMITENTE') ?? 'Quiniela DEGASA <onboarding@resend.dev>';

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Traer hasta 50 correos pendientes
  const { data: pendientes, error } = await admin
    .from('correos_cola')
    .select('*')
    .eq('enviado', false)
    .lt('intentos', 3)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return json({ error: error.message }, 500);
  if (!pendientes || pendientes.length === 0) {
    return json({ ok: true, mensaje: 'No hay correos pendientes', enviados: 0 });
  }

  // Si no hay API key, no enviamos (dejamos en cola) pero respondemos OK
  if (!RESEND_API_KEY) {
    return json({
      ok: true,
      mensaje: 'RESEND_API_KEY no configurada; correos quedan en cola.',
      pendientes: pendientes.length,
      enviados: 0,
    });
  }

  let enviados = 0;
  let fallidos = 0;

  for (const correo of pendientes) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: CORREO_REMITENTE,
          to: [correo.destinatario],
          subject: correo.asunto,
          html: correo.cuerpo_html,
        }),
      });

      if (res.ok) {
        await admin.from('correos_cola')
          .update({ enviado: true, enviado_en: new Date().toISOString(), error: null })
          .eq('id', correo.id);
        enviados++;
      } else {
        const txt = await res.text();
        await admin.from('correos_cola')
          .update({ intentos: (correo.intentos ?? 0) + 1, error: txt.slice(0, 500) })
          .eq('id', correo.id);
        fallidos++;
      }
    } catch (err) {
      await admin.from('correos_cola')
        .update({ intentos: (correo.intentos ?? 0) + 1, error: String(err).slice(0, 500) })
        .eq('id', correo.id);
      fallidos++;
    }
  }

  return json({ ok: true, enviados, fallidos, procesados: pendientes.length });
});
