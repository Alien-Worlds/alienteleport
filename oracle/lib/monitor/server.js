'use strict';

const http = require('http');
const { toPublicStatus } = require('./status');
const { renderHtml } = require('./html');

function startStatusServer(opts) {
  if (!opts.statusPort) {
    console.log('HTTP status API disabled (STATUS_PORT=0)');
    return null;
  }

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathName = url.pathname.replace(/\/+$/, '') || '/';

    const send = (code, type, body) => {
      res.writeHead(code, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(body);
    };

    try {
      if (pathName === '/health' || pathName === '/api/health') {
        const st = toPublicStatus();
        send(
          200,
          'application/json; charset=utf-8',
          JSON.stringify({
            ok: st.healthy,
            status: st.status,
            status_label: st.status_label,
            status_detail: st.status_detail,
            severity: st.severity,
            reasons: (st.reasons || []).map((r) => r.code),
            status_hint: st.status_hint,
            last_scan_at: st.last_scan_at,
            scanning: st.scanning,
            antelope_chain: st.antelope_chain,
            summary: st.summary || null,
            readers: st.chain_readers ? st.chain_readers.summary : null,
          })
        );
        return;
      }

      if (pathName === '/api/status' || pathName === '/api/v1/status') {
        send(200, 'application/json; charset=utf-8', JSON.stringify(toPublicStatus(), null, 2));
        return;
      }

      if (pathName === '/' || pathName === '/status') {
        send(200, 'text/html; charset=utf-8', renderHtml(toPublicStatus()));
        return;
      }

      send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'not_found' }));
    } catch (_) {
      send(500, 'application/json; charset=utf-8', JSON.stringify({ error: 'internal' }));
    }
  });

  server.listen(opts.statusPort, opts.statusBind, () => {
    console.log(`HTTP status API listening on http://${opts.statusBind}:${opts.statusPort}/`);
    console.log('  HTML  GET /');
    console.log('  JSON  GET /api/status');
    console.log('  health GET /health');
  });

  server.on('error', (e) => {
    console.error(`HTTP status server error: ${e.message}`);
  });

  return server;
}

module.exports = { startStatusServer };
