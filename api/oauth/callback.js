const { getOAuthClient } = require('../_lib/googleAuth');

module.exports = async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    res.status(400).send(`Autorização negada pelo Google: ${error}`);
    return;
  }

  if (!code) {
    res.status(400).send('Parâmetro "code" ausente na URL de callback.');
    return;
  }

  try {
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);

    if (!tokens.refresh_token) {
      res.status(200).send(
        'Nenhum refresh_token foi retornado (provavelmente essa conta já autorizou este app antes). ' +
        'Revogue o acesso em https://myaccount.google.com/permissions e tente novamente pelo /api/oauth/start.'
      );
      return;
    }

    res.status(200).send(`
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <h2>Autorização concluída</h2>
          <p>Copie o valor abaixo e cole na variável de ambiente <code>GOOGLE_REFRESH_TOKEN</code> na Vercel, depois faça um redeploy.</p>
          <textarea readonly style="width:100%; height:80px; font-family: monospace; padding: 8px;">${tokens.refresh_token}</textarea>
          <p style="color:#b91c1c;">Não compartilhe este valor com ninguém — ele dá acesso à agenda da conta.</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`Erro ao trocar o código por tokens: ${err.message}`);
  }
};
