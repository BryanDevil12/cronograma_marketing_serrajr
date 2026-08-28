const { getOAuthClient } = require('../_lib/googleAuth');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

module.exports = async (req, res) => {
  const setupSecret = process.env.OAUTH_SETUP_SECRET;
  const provided = req.query.secret;

  if (!setupSecret || provided !== setupSecret) {
    res.status(401).send('Acesso negado. Informe ?secret=<OAUTH_SETUP_SECRET> correto na URL.');
    return;
  }

  try {
    const oAuth2Client = getOAuthClient();
    const url = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err) {
    res.status(500).send(`Erro ao gerar URL de autorização: ${err.message}`);
  }
};
