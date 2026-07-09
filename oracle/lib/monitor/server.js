'use strict';

const http = require('http');
const { live } = require('./context');
const { collectReaders } = require('./readers');
const { toPublicStatus } = require('./status');
const { renderHtml } = require('./html');

/** How often HTTP requests may re-poll chain heads / PM2 cursors (ms). */
const READERS_MIN_INTERVAL_MS = Number(process.env.READERS_REFRESH_MS || 10000);

/**
 * Light refresh of reader lag between full table scans so the dashboard
 * doesn't look frozen for INTERVAL_SEC (often 300s).
 */
async function maybeRefreshReaders() {
  if (live.refreshing_readers) return;
  const last = live.last_readers_at ? Date.parse(live.last_readers_at) : 0;
  if (Date.now() - last < READERS_MIN_INTERVAL_MS) return;

  live.refreshing_readers = true;
  try {
    const readers = await collectReaders();
    live.last_readers_at = new Date().toISOString();
    if (live.report) {
      live.report.chain_readers = readers;
      // Re-derive exit hint if lag is the only issue
      // (full exitCode needs full report; status page uses deriveStatus)
    } else {
      live.report = {
        ts: live.last_readers_at,
        oracle: null,
        antelope_chain: readers.antelope_chain,
        missing_for_this_oracle: {
          count: 0,
          wax_to_evm: [],
          antelope_to_evm: [],
          evm_to_wax: [],
          evm_to_antelope: [],
        },
        system_incomplete: {
          count: 0,
          wax_to_evm: [],
          antelope_to_evm: [],
          evm_to_wax: [],
          evm_to_antelope: [],
        },
        awaiting_user_claim: { count: 0, sample: [] },
        thresholds: { historical_age_sec: 365 * 24 * 3600 },
        chain_readers: readers,
        scanned: { teleports: 0, receipts: 0, pages: 0 },
      };
    }
  } catch (e) {
    // keep previous snapshot
    console.error(`readers refresh error: ${e.message || e}`);
  } finally {
    live.refreshing_readers = false;
  }
}

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
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(body);
    };

    (async () => {
      try {
        // Always try a light reader refresh so lag numbers move between full scans
        if (
          pathName === '/' ||
          pathName === '/status' ||
          pathName === '/api/status' ||
          pathName === '/api/v1/status' ||
          pathName === '/health' ||
          pathName === '/api/health'
        ) {
          await maybeRefreshReaders();
        }

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
              last_readers_at: live.last_readers_at,
              scanning: st.scanning,
              antelope_chain: st.antelope_chain,
              summary: st.summary || null,
              readers: st.chain_readers ? st.chain_readers.summary : null,
            })
          );
          return;
        }

        if (pathName === '/api/status' || pathName === '/api/v1/status') {
          const st = toPublicStatus();
          st.last_readers_at = live.last_readers_at;
          send(200, 'application/json; charset=utf-8', JSON.stringify(st, null, 2));
          return;
        }

        if (pathName === '/' || pathName === '/status') {
          const st = toPublicStatus();
          st.last_readers_at = live.last_readers_at;
          send(200, 'text/html; charset=utf-8', renderHtml(st));
          return;
        }

        send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'not_found' }));
      } catch (_) {
        send(500, 'application/json; charset=utf-8', JSON.stringify({ error: 'internal' }));
      }
    })();
  });

  server.listen(opts.statusPort, opts.statusBind, () => {
    console.log(`HTTP status API listening on http://${opts.statusBind}:${opts.statusPort}/`);
    console.log('  HTML  GET /');
    console.log('  JSON  GET /api/status');
    console.log('  health GET /health');
    console.log(`  readers refresh on request (min ${READERS_MIN_INTERVAL_MS}ms)`);
  });

  server.on('error', (e) => {
    console.error(`HTTP status server error: ${e.message}`);
  });

  return server;
}

module.exports = { startStatusServer };
