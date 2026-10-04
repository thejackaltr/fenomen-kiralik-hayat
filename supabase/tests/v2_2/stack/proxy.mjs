// LOCAL TEST ONLY: Kong stand-in on 127.0.0.1. /auth/v1/* -> GoTrue, /rest/v1/* -> PostgREST (prefix stripped),
// so supabase-js can use one URL like in production. No key-auth (Kong's apikey check is not part of this test).
import http from 'node:http';
const [port, authPort, restPort] = process.argv.slice(2).map(Number);
http.createServer((req, res) => {
  let target, path;
  if (req.url.startsWith('/auth/v1')) { target = authPort; path = req.url.slice('/auth/v1'.length) || '/'; }
  else if (req.url.startsWith('/rest/v1')) { target = restPort; path = req.url.slice('/rest/v1'.length) || '/'; }
  else { res.writeHead(404); return res.end(); }
  const p = http.request({ host: '127.0.0.1', port: target, path, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${target}` } }, (r) => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  p.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(p);
}).listen(port, '127.0.0.1');
