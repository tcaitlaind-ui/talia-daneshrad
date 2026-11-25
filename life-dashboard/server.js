// Local server: serves public/ and reads/writes data.json. No dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data.json');
const SEED = path.join(ROOT, 'data.seed.json');
const PUBLIC = path.join(ROOT, 'public');

// First run: copy the seed (full plan object, empty days/weeks/months).
if (!fs.existsSync(DATA)) fs.copyFileSync(SEED, DATA);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function writeData(obj) {
  // Write to a temp file then rename, so a crash mid-write never corrupts data.json.
  const tmp = DATA + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, DATA);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/data') {
    if (req.method === 'GET') {
      try { return send(res, 200, fs.readFileSync(DATA, 'utf8'), TYPES['.json']); }
      catch (e) { return send(res, 500, 'Could not read data.json'); }
    }
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 5e6) { req.destroy(); }
      });
      req.on('end', () => {
        let obj;
        try { obj = JSON.parse(body); } catch (e) { return send(res, 400, 'Invalid JSON'); }
        if (!obj || typeof obj !== 'object' || !obj.config || !obj.config.plan) {
          return send(res, 400, 'Missing config.plan, refusing to overwrite data.json');
        }
        try { writeData(obj); return send(res, 204, ''); }
        catch (e) { return send(res, 500, 'Could not write data.json'); }
      });
      return;
    }
    return send(res, 405, 'Method not allowed');
  }

  if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}`;
  console.log(`Life Dashboard running at ${link}`);
  console.log(`Data file: ${DATA}`);
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', link] : [link];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch (e) { /* open it by hand */ }
});
