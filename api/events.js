const { applyCors } = require('./_lib/cors');
const { requireAdminSecret } = require('./_lib/auth');
const { getSupabase } = require('./_lib/supabase');

function rowsToEventDB(rows) {
  const eventDB = {};
  (rows || []).forEach((row) => {
    if (!eventDB[row.date_key]) eventDB[row.date_key] = [];
    eventDB[row.date_key].push({
      id: row.id,
      type: row.type,
      title: row.title,
      responsible: row.responsible || '',
      responsible2: row.responsible2 || '',
      reviewer: row.reviewer || '',
      details: row.details || '',
    });
  });
  return eventDB;
}

function flattenEventDB(eventDB) {
  const flat = [];
  Object.keys(eventDB || {}).forEach((dateKey) => {
    (eventDB[dateKey] || []).forEach((ev) => {
      flat.push({ dateKey, ev });
    });
  });
  return flat;
}

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('events').select('*');
    if (error) {
      res.status(500).json({ error: 'supabase_error', message: error.message });
      return;
    }
    res.status(200).json({ eventDB: rowsToEventDB(data) });
    return;
  }

  if (req.method === 'PUT') {
    if (!requireAdminSecret(req, res)) return;

    const body = req.body || {};
    const eventDB = body.eventDB;

    if (!eventDB || typeof eventDB !== 'object') {
      res.status(400).json({ error: 'invalid_body', message: 'Envie { eventDB } no corpo da requisição.' });
      return;
    }

    const flat = flattenEventDB(eventDB);
    const rows = flat.map(({ dateKey, ev }) => ({
      id: ev.id,
      date_key: dateKey,
      type: ev.type,
      title: ev.title,
      responsible: ev.responsible || '',
      responsible2: ev.responsible2 || '',
      reviewer: ev.reviewer || '',
      details: ev.details || '',
      updated_at: new Date().toISOString(),
    }));

    const incomingIds = new Set(rows.map((r) => r.id));

    const { data: existingRows, error: fetchError } = await supabase.from('events').select('id');
    if (fetchError) {
      res.status(500).json({ error: 'supabase_error', message: fetchError.message });
      return;
    }

    // Proteção contra sobrescrever tudo com um payload vazio/incompleto
    // (ex: sincronizando de um navegador/perfil sem os dados reais).
    const existingCount = (existingRows || []).length;
    if (existingCount >= 5 && rows.length < existingCount * 0.5) {
      res.status(409).json({
        error: 'suspicious_payload',
        message: `Este envio salvaria apenas ${rows.length} eventos, contra ${existingCount} já existentes. Isso costuma acontecer com dados incompletos. Salvamento cancelado por segurança.`,
      });
      return;
    }

    const idsToDelete = (existingRows || [])
      .map((r) => r.id)
      .filter((id) => !incomingIds.has(id));

    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabase.from('events').delete().in('id', idsToDelete);
      if (deleteError) {
        res.status(500).json({ error: 'supabase_error', message: deleteError.message });
        return;
      }
    }

    if (rows.length > 0) {
      const { error: upsertError } = await supabase.from('events').upsert(rows, { onConflict: 'id' });
      if (upsertError) {
        res.status(500).json({ error: 'supabase_error', message: upsertError.message });
        return;
      }
    }

    res.status(200).json({ ok: true, count: rows.length });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
