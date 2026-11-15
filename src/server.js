import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(RACINE, 'public');
const DUREE_SESSION_MS = 30 * 24 * 3600 * 1000;

const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  secret: process.env.SESSION_SECRET || '',
};

const authEnabled = Boolean(config.clientId && config.clientSecret && config.secret);
const securise = config.baseUrl.startsWith('https');
if (!authEnabled) {
  console.warn('Auth Google désactivée: variables GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/SESSION_SECRET manquantes.');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function signer(charge) {
  const corps = Buffer.from(JSON.stringify(charge)).toString('base64url');
  const signature = crypto.createHmac('sha256', config.secret).update(corps).digest('base64url');
  return `${corps}.${signature}`;
}

function lireJeton(jeton) {
  if (!jeton) return null;
  const [corps, signature] = jeton.split('.');
  if (!corps || !signature) return null;
  const attendue = crypto.createHmac('sha256', config.secret).update(corps).digest('base64url');
  if (signature.length !== attendue.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(attendue))) return null;
  try {
    const charge = JSON.parse(Buffer.from(corps, 'base64url').toString());
    if (charge.exp && charge.exp < Date.now()) return null;
    return charge;
  } catch {
    return null;
  }
}

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf('=');
        if (i < 0) return [c, ''];
        return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
      }),
  );
}

function cookie(nom, valeur, maxAge) {
  return `${nom}=${encodeURIComponent(valeur)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${securise ? '; Secure' : ''}`;
}

function envoyerJson(res, statut, donnees, entetes = {}) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...entetes });
  res.end(JSON.stringify(donnees));
}

function rediriger(res, cible, entetes = {}) {
  res.writeHead(302, { Location: cible, ...entetes });
  res.end();
}

function session(req) {
  return lireJeton(cookies(req).balatom_session);
}

function servirStatique(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel);
  const fichier = path.normalize(path.join(PUBLIC, rel));
  if (!fichier.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  let cible = fichier;
  try {
    const st = fs.statSync(cible);
    if (st.isDirectory()) cible = path.join(cible, 'index.html');
  } catch {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const data = fs.readFileSync(cible);
    const ext = path.extname(cible).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

async function routeAuth(req, res, url) {
  if (!authEnabled) {
    res.writeHead(404); res.end('Auth non configurée'); return;
  }
  const redirectUri = `${config.baseUrl}/auth/google/callback`;

  if (url.pathname === '/auth/google') {
    const etat = crypto.randomBytes(16).toString('hex');
    const cible = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    cible.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state: etat,
      prompt: 'select_account',
    }).toString();
    return rediriger(res, cible.toString(), { 'Set-Cookie': cookie('balatom_etat', etat, 600) });
  }

  if (url.pathname === '/auth/google/callback') {
    const attendu = cookies(req).balatom_etat;
    const recu = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    if (!attendu || !recu || attendu !== recu || !code) {
      return rediriger(res, '/?erreur=auth', { 'Set-Cookie': cookie('balatom_etat', '', 0) });
    }
    const reponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const donnees = await reponse.json();
    if (!reponse.ok || !donnees.id_token) {
      return rediriger(res, '/?erreur=auth', { 'Set-Cookie': cookie('balatom_etat', '', 0) });
    }
    const payload = JSON.parse(Buffer.from(donnees.id_token.split('.')[1], 'base64url').toString());
    if (payload.aud !== config.clientId || !payload.sub) {
      return rediriger(res, '/?erreur=auth', { 'Set-Cookie': cookie('balatom_etat', '', 0) });
    }
    const nom = payload.name || payload.email || 'Joueur';
    const sess = signer({ sub: payload.sub, nom, email: payload.email || '', exp: Date.now() + DUREE_SESSION_MS });
    return rediriger(res, '/', {
      'Set-Cookie': [cookie('balatom_session', sess, DUREE_SESSION_MS / 1000), cookie('balatom_etat', '', 0)],
    });
  }

  if (url.pathname === '/auth/deconnexion' && req.method === 'POST') {
    return rediriger(res, '/', { 'Set-Cookie': cookie('balatom_session', '', 0) });
  }

  res.writeHead(404); res.end('Not found');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, config.baseUrl);
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return envoyerJson(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/me') {
      if (!authEnabled) return envoyerJson(res, 200, { auth: false, nom: 'Invité' });
      const s = session(req);
      if (!s) return envoyerJson(res, 401, { auth: true, erreur: 'Non connecté' });
      return envoyerJson(res, 200, { auth: true, sub: s.sub, nom: s.nom, email: s.email || '' });
    }
    if (url.pathname.startsWith('/auth/')) {
      return await routeAuth(req, res, url);
    }
    if (req.method === 'GET') {
      return servirStatique(res, url.pathname);
    }
    res.writeHead(405); res.end('Method not allowed');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.writeHead(500); res.end('Erreur serveur'); }
  }
});

server.listen(config.port, () => {
  console.log(`Balatom sur le port ${config.port}`);
});
