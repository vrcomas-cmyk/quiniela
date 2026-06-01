// Edge Function: cron-tareas
//
// Tareas automáticas que corren periódicamente (la llama pg_cron cada 15 min):
//   1. Publica las fases cuyo momento de publicación programada ya llegó
//   2. Encola recordatorios para jugadores que no han pronosticado, cuando
//      faltan ~24h y ~2h para el cierre de una fase abierta
//   3. Procesa la cola de correos (invoca procesar-correos)
//
// Despliegue:
//   supabase functions deploy cron-tareas
//
// No requiere secrets propios además de los estándar de Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function plantillaRecordatorio(nombre: string, fase: string, horasRestantes: number, faltantes: number, urlApp: string): string {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #0a5526, #053018); padding: 24px; text-align: center;">
      <h1 style="color: #fff; margin: 0; font-size: 24px;">⚽ Quiniela Mundial 2026</h1>
    </div>
    <div style="padding: 24px; background: #f0f9f1;">
      <p style="font-size: 16px;">Hola <b>${nombre}</b>,</p>
      <p style="font-size: 16px;">
        Te recordamos que la fase <b>${fase}</b> cierra en aproximadamente
        <b style="color: #ea580c;">${horasRestantes} horas</b>.
      </p>
      ${faltantes > 0
        ? `<p style="font-size: 16px;">Te faltan <b style="color:#ea580c;">${faltantes} partido(s)</b> por pronosticar. ¡No te quedes sin puntos!</p>`
        : `<p style="font-size: 16px;">Verifica que tus pronósticos estén completos.</p>`}
      <div style="text-align: center; margin: 24px 0;">
        <a href="${urlApp}" style="background: #f97316; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Ir a mis pronósticos
        </a>
      </div>
      <p style="font-size: 12px; color: #666;">Si ya completaste tus pronósticos, ignora este mensaje.</p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const URL_APP = Deno.env.get('URL_APP') ?? 'https://tu-app.vercel.app';

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const resultado: any = { publicadas: 0, recordatorios_encolados: 0, correos: null };

  // ---- 1. Publicar fases programadas ----
  const { data: pubData } = await admin.rpc('publicar_fases_programadas');
  resultado.publicadas = pubData ?? 0;

  // ---- 2. Encolar recordatorios ----
  // Buscar fases abiertas (apertura pasada, cierre futuro)
  const ahora = new Date();
  const { data: fases } = await admin
    .from('fases')
    .select('*')
    .not('fecha_cierre', 'is', null)
    .lte('fecha_apertura', ahora.toISOString())
    .gt('fecha_cierre', ahora.toISOString());

  for (const fase of fases ?? []) {
    const cierre = new Date(fase.fecha_cierre);
    const horasRestantes = (cierre.getTime() - ahora.getTime()) / (1000 * 60 * 60);

    // Determinar si estamos en ventana de 24h (entre 23 y 24h) o 2h (entre 1.5 y 2h)
    let momento: string | null = null;
    if (horasRestantes <= 24 && horasRestantes > 23) momento = '24h';
    else if (horasRestantes <= 2 && horasRestantes > 1.5) momento = '2h';
    if (!momento) continue;

    // Progreso de pronósticos de esta fase
    const { data: progreso } = await admin
      .from('progreso_pronosticos')
      .select('*')
      .eq('fase_id', fase.id);

    for (const p of progreso ?? []) {
      // Solo recordar a quienes les faltan partidos
      if ((p.faltantes ?? 0) <= 0) continue;

      // ¿Ya se le envió este recordatorio?
      const { data: yaEnviado } = await admin
        .from('recordatorios_enviados')
        .select('id')
        .eq('user_id', p.user_id)
        .eq('fase_id', fase.id)
        .eq('momento', momento)
        .maybeSingle();
      if (yaEnviado) continue;

      // Obtener email del usuario
      const { data: authUser } = await admin.auth.admin.getUserById(p.user_id);
      const email = authUser?.user?.email;
      if (!email) continue;

      // Encolar correo
      await admin.from('correos_cola').insert({
        destinatario: email,
        nombre_destinatario: p.nombre_completo,
        asunto: `⏰ Faltan ~${Math.round(horasRestantes)}h para el cierre de ${fase.nombre}`,
        cuerpo_html: plantillaRecordatorio(p.nombre_completo, fase.nombre, Math.round(horasRestantes), p.faltantes, URL_APP),
        tipo: 'recordatorio',
      });

      // Marcar como enviado para no duplicar
      await admin.from('recordatorios_enviados').insert({
        user_id: p.user_id, fase_id: fase.id, momento,
      });
      resultado.recordatorios_encolados++;
    }
  }

  // ---- 3. Procesar la cola de correos ----
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/procesar-correos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    resultado.correos = await res.json();
  } catch (err) {
    resultado.correos = { error: String(err) };
  }

  return json({ ok: true, ...resultado });
});
