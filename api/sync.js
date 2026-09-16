const crypto = require('crypto');
const { applyCors } = require('./_lib/cors');
const { requireAdminSecret } = require('./_lib/auth');
const { getSupabase } = require('./_lib/supabase');
const { createEvent, updateEvent, deleteEvent, isReauthError } = require('./_lib/googleCalendar');

function contentHash(dateKey, ev) {
  const payload = JSON.stringify({
    dateKey,
    type: ev.type,
    title: ev.title,
    responsible: ev.responsible || '',
    reviewer: ev.reviewer || '',
    details: ev.details || '',
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

  const summary = { created: 0, updated: 0, deleted: 0, skipped: [], failed: [] };

  let allNames = [];
  currentEvents.forEach(({ ev }) => {
    if (ev.responsible) allNames.push(ev.responsible);
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

  // Excluir do Google eventos que não existem mais no payload atual.
  for (const row of existingRows || []) {
    const key = `${row.date_key}:${row.dashboard_event_id}`;
    if (currentKeys.has(key)) continue;

    try {
      await deleteEvent(row.google_event_id);
      await supabase.from('synced_events').delete().eq('date_key', row.date_key).eq('dashboard_event_id', row.dashboard_event_id);
      summary.deleted++;
    } catch (err) {
      if (isReauthError(err)) {
        res.status(401).json({ error: 'google_reauth_required' });
        return;
      }
      summary.failed.push({ dateKey: row.date_key, eventId: row.dashboard_event_id, action: 'delete', message: err.message });
    }
  }

  // Criar ou atualizar eventos do payload atual.
  for (const { dateKey, ev } of currentEvents) {
    const key = `${dateKey}:${ev.id}`;
    const existing = existingByKey.get(key);
    const hash = contentHash(dateKey, ev);
    const attendeeEmails = [ev.responsible, ev.reviewer]
      .filter(Boolean)
      .map((name) => emailsByName[name])
      .filter(Boolean);

    try {
      if (!existing) {
        const googleEventId = await createEvent(dateKey, ev, attendeeEmails);
        await supabase.from('synced_events').insert({
          date_key: dateKey,
          dashboard_event_id: ev.id,
          google_event_id: googleEventId,
          content_hash: hash,
        });
        summary.created++;
      } else if (existing.content_hash !== hash) {
        await updateEvent(existing.google_event_id, dateKey, ev, attendeeEmails);
        await supabase
          .from('synced_events')
          .update({ content_hash: hash, last_synced_at: new Date().toISOString() })
          .eq('date_key', dateKey)
          .eq('dashboard_event_id', ev.id);
        summary.updated++;
      }
    } catch (err) {
      if (isReauthError(err)) {
        res.status(401).json({ error: 'google_reauth_required' });
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
  }

  res.status(200).json(summary);
};
