const crypto = require('crypto');
const { applyCors } = require('./_lib/cors');
const { requireAdminSecret } = require('./_lib/auth');
const { getSupabase } = require('./_lib/supabase');
const { createEvent, updateEvent, deleteEvent, isReauthError } = require('./_lib/googleCalendar');

// Incrementar quando a config fixa do evento no Google (reminders, etc.) mudar,
// para forçar re-sincronização de todos os eventos já criados.
const SYNC_CONFIG_VERSION = 2;

function contentHash(dateKey, ev) {
  const payload = JSON.stringify({
    dateKey,
    type: ev.type,
    title: ev.title,
    responsible: ev.responsible || '',
    responsible2: ev.responsible2 || '',
    reviewer: ev.reviewer || '',
    details: ev.details || '',
    syncConfigVersion: SYNC_CONFIG_VERSION,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function flattenEvents(eventDB) {
  const flat = [];
  Object.keys(eventDB || {}).forEach((dateKey) => {
    (eventDB[dateKey] || []).forEach((ev) => {
      flat.push({ dateKey, ev });
    });
  });
  return flat;
}

// Processa itens em lotes concorrentes (em vez de um por um), respeitando
// um limite para não estourar o rate limit da Google Calendar API.
async function processInBatches(items, batchSize, worker) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(worker));
  }
}

async function resolveAttendeeEmails(supabase, names) {
  const uniqueNames = Array.from(new Set(names.filter(Boolean)));
  if (uniqueNames.length === 0) return { emailsByName: {}, skipped: [] };

  const { data, error } = await supabase
    .from('team_members')
    .select('name, email');

  if (error) throw new Error(`Falha ao buscar e-mails da equipe: ${error.message}`);

  const emailsByName = {};
  const skipped = [];
  uniqueNames.forEach((name) => {
    const row = (data || []).find((r) => r.name === name);
    if (row && row.email) {
      emailsByName[name] = row.email;
    } else {
      skipped.push(name);
    }
  });

  return { emailsByName, skipped };
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!requireAdminSecret(req, res)) return;

  const body = req.body || {};
  const eventDB = body.eventDB;

  if (!eventDB || typeof eventDB !== 'object') {
    res.status(400).json({ error: 'invalid_body', message: 'Envie { eventDB } no corpo da requisição.' });
    return;
  }

  const supabase = getSupabase();
  const currentEvents = flattenEvents(eventDB);

  const { data: existingRows, error: fetchError } = await supabase
    .from('synced_events')
    .select('date_key, dashboard_event_id, google_event_id, content_hash');

  if (fetchError) {
    res.status(500).json({ error: 'supabase_error', message: fetchError.message });
    return;
  }

  const existingByKey = new Map();
  (existingRows || []).forEach((row) => {
    existingByKey.set(`${row.date_key}:${row.dashboard_event_id}`, row);
  });

  const currentKeys = new Set(currentEvents.map(({ dateKey, ev }) => `${dateKey}:${ev.id}`));

  // Proteção contra sync feito a partir de um navegador/perfil sem os dados
  // reais do cronograma (ex: aba anônima): se o payload enviado teria que
  // excluir uma fatia grande do que já está sincronizado, recusa e avisa,
  // em vez de apagar tudo silenciosamente.
  const existingCount = (existingRows || []).length;
  const wouldDeleteCount = (existingRows || []).filter((row) => !currentKeys.has(`${row.date_key}:${row.dashboard_event_id}`)).length;
  if (existingCount >= 5 && wouldDeleteCount > existingCount * 0.5) {
    res.status(409).json({
      error: 'suspicious_payload',
      message: `Este envio excluiria ${wouldDeleteCount} de ${existingCount} eventos já sincronizados. Isso costuma acontecer ao sincronizar de um navegador/perfil sem os dados reais do cronograma. Sincronização cancelada por segurança — confira se está no navegador certo.`,
    });
    return;
  }

  const summary = { created: 0, updated: 0, deleted: 0, skipped: [], failed: [] };

  let allNames = [];
  currentEvents.forEach(({ ev }) => {
    if (ev.responsible) allNames.push(ev.responsible);
    if (ev.responsible2) allNames.push(ev.responsible2);
    if (ev.reviewer) allNames.push(ev.reviewer);
  });

  let emailsByName = {};
  try {
    const resolved = await resolveAttendeeEmails(supabase, allNames);
    emailsByName = resolved.emailsByName;
    summary.skipped = resolved.skipped.map((name) => `${name} (sem e-mail cadastrado)`);
  } catch (err) {
    res.status(500).json({ error: 'supabase_error', message: err.message });
    return;
  }

  let reauthRequired = false;
  const BATCH_SIZE = 6;

  // Excluir do Google eventos que não existem mais no payload atual.
  const rowsToDelete = (existingRows || []).filter((row) => !currentKeys.has(`${row.date_key}:${row.dashboard_event_id}`));

  await processInBatches(rowsToDelete, BATCH_SIZE, async (row) => {
    if (reauthRequired) return;
    try {
      await deleteEvent(row.google_event_id);
      const { error: deleteError } = await supabase.from('synced_events').delete().eq('date_key', row.date_key).eq('dashboard_event_id', row.dashboard_event_id);
      if (deleteError) throw new Error(`Evento excluído no Google mas falhou ao remover do Supabase: ${deleteError.message}`);
      summary.deleted++;
    } catch (err) {
      if (isReauthError(err)) {
        reauthRequired = true;
        return;
      }
      summary.failed.push({ dateKey: row.date_key, eventId: row.dashboard_event_id, action: 'delete', message: err.message });
    }
  });

  if (reauthRequired) {
    res.status(401).json({ error: 'google_reauth_required' });
    return;
  }

  // Criar ou atualizar eventos do payload atual.
  await processInBatches(currentEvents, BATCH_SIZE, async ({ dateKey, ev }) => {
    if (reauthRequired) return;
    const key = `${dateKey}:${ev.id}`;
    const existing = existingByKey.get(key);
    const hash = contentHash(dateKey, ev);
    const attendeeEmails = [ev.responsible, ev.responsible2, ev.reviewer]
      .filter(Boolean)
      .map((name) => emailsByName[name])
      .filter(Boolean);

    try {
      if (!existing) {
        const googleEventId = await createEvent(dateKey, ev, attendeeEmails);
        const { error: insertError } = await supabase.from('synced_events').insert({
          date_key: dateKey,
          dashboard_event_id: ev.id,
          google_event_id: googleEventId,
          content_hash: hash,
        });
        if (insertError) throw new Error(`Evento criado no Google (${googleEventId}) mas falhou ao salvar no Supabase: ${insertError.message}`);
        summary.created++;
      } else if (existing.content_hash !== hash) {
        await updateEvent(existing.google_event_id, dateKey, ev, attendeeEmails);
        const { error: updateError } = await supabase
          .from('synced_events')
          .update({ content_hash: hash, last_synced_at: new Date().toISOString() })
          .eq('date_key', dateKey)
          .eq('dashboard_event_id', ev.id);
        if (updateError) throw new Error(`Evento atualizado no Google mas falhou ao salvar no Supabase: ${updateError.message}`);
        summary.updated++;
      }
    } catch (err) {
      if (isReauthError(err)) {
        reauthRequired = true;
        return;
      }
      const googleErrors = err && err.errors ? JSON.stringify(err.errors) : null;
      const googleDetail = err && err.response && err.response.data
        ? JSON.stringify(err.response.data)
        : null;
      summary.failed.push({
        dateKey,
        eventId: ev.id,
        action: existing ? 'update' : 'create',
        message: googleErrors || googleDetail || err.message,
      });
    }
  });

  if (reauthRequired) {
    res.status(401).json({ error: 'google_reauth_required' });
    return;
  }

  res.status(200).json(summary);
};
