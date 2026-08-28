function requireAdminSecret(req, res) {
  const provided = req.headers['x-admin-secret'];
  const expected = process.env.ADMIN_SYNC_SECRET;

  if (!expected) {
    res.status(500).json({ error: 'server_misconfigured', message: 'ADMIN_SYNC_SECRET não configurado.' });
    return false;
  }

  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'unauthorized', message: 'Admin secret inválido ou ausente.' });
    return false;
  }

  return true;
}

module.exports = { requireAdminSecret };
