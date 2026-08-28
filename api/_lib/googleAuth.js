const { google } = require('googleapis');

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI não configurados.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthorizedClient() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!refreshToken) {
    const err = new Error('GOOGLE_REFRESH_TOKEN não configurado. Rode /api/oauth/start primeiro.');
    err.code = 'google_reauth_required';
    throw err;
  }

  const oAuth2Client = getOAuthClient();
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  return oAuth2Client;
}

module.exports = { getOAuthClient, getAuthorizedClient };
