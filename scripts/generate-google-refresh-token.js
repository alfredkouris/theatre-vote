require('dotenv').config();

const http = require('http');
const { google } = require('googleapis');

const PORT = Number.parseInt(process.env.GOOGLE_OAUTH_PORT || '3005', 10);
const HOST = process.env.GOOGLE_OAUTH_HOST || '127.0.0.1';
const REDIRECT_PATH = '/oauth2callback';
const REDIRECT_URI = `http://${HOST}:${PORT}${REDIRECT_PATH}`;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send'
];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.');
  console.error('Set them in your shell or in .env before running this script.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: true,
  scope: SCOPES
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);

    if (url.pathname !== REDIRECT_PATH) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    const error = url.searchParams.get('error');
    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`OAuth error: ${error}`);
      console.error(`OAuth error: ${error}`);
      shutdown(1);
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing code');
      console.error('Missing authorization code in callback.');
      shutdown(1);
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <h1>Refresh token captured</h1>
          <p>You can close this window and return to the terminal.</p>
        </body>
      </html>
    `);

    console.log('');
    console.log('Google OAuth complete.');
    console.log('');
    console.log(`Authorized redirect URI used: ${REDIRECT_URI}`);
    console.log('');

    if (tokens.refresh_token) {
      console.log('Add this to Railway or your local .env:');
      console.log('');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('');
    } else {
      console.log('No refresh token was returned.');
      console.log('This usually means Google already granted this client access.');
      console.log('Try again after revoking the app at https://myaccount.google.com/permissions');
      console.log('Then rerun this script with prompt=consent still enabled.');
      console.log('');
    }

    shutdown(0);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Token exchange failed');
    console.error('Token exchange failed:', error.message);
    shutdown(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log('Open this URL in your browser and sign into the correct Google account:');
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log(`Listening for callback on ${REDIRECT_URI}`);
  console.log('');
  console.log('Before you continue, make sure this exact redirect URI is in Google Cloud:');
  console.log(REDIRECT_URI);
});

function shutdown(code) {
  server.close(() => {
    process.exit(code);
  });
}
