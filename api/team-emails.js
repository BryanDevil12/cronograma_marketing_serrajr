const { applyCors } = require('./_lib/cors');
const { requireAdminSecret } = require('./_lib/auth');
const { getSupabase } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;
  if (!requireAdminSecret(req, res)) return;

  const supabase = getSupabase();

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('team_members').select('name, email').order('name');
    if (error) {
      res.status(500).json({ error: 'supabase_error', message: error.message });
      return;
    }
    res.status(200).json({ members: data });
    return;
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const members = Array.isArray(body.members) ? body.members : null;

    if (!members) {
      res.status(400).json({ error: 'invalid_body', message: 'Envie { members: [{ name, email }] }.' });
      return;
    }

    const incoming = members
      .filter((m) => m && typeof m.name === 'string' && m.name.trim())
      .map((m) => ({ name: m.name.trim(), email: (m.email || '').trim() || null }));

    // Nunca apagar um e-mail já cadastrado: se o payload vier sem e-mail para
    // um nome que já tem um salvo, mantém o valor existente em vez de sobrescrever
    // com null (protege contra sync feito de um navegador/perfil sem os dados locais).
    const { data: existing, error: fetchError } = await supabase.from('team_members').select('name, email');
    if (fetchError) {
      res.status(500).json({ error: 'supabase_error', message: fetchError.message });
      return;
    }
    const existingEmailByName = new Map((existing || []).map((r) => [r.name, r.email]));

    const rows = incoming.map((m) => ({
      name: m.name,
      email: m.email || existingEmailByName.get(m.name) || null,
    }));

    const { error } = await supabase.from('team_members').upsert(rows, { onConflict: 'name' });

    if (error) {
      res.status(500).json({ error: 'supabase_error', message: error.message });
      return;
    }

    res.status(200).json({ ok: true, count: rows.length });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
