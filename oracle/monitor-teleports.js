#!/usr/bin/env node

/**
 * Monitor for incomplete / missing oracle participation on teleports.
 *
 * Directions:
 *   teleports table  — Antelope → EVM (need oracle signatures for claim)
 *   receipts table   — EVM → Antelope (need oracle received confirmations)
 *
 * Usage:
 *   CONFIG=./config-eth.js node monitor-teleports.js --once
 *   CONFIG=./config-eth.js node monitor-teleports.js --once --all-chains
 *   CONFIG=./config-eth.js INTERVAL_SEC=300 node monitor-teleports.js   # watch mode
 *
 * Exit codes (--once only):
 *   0  — nothing this oracle is missing; system thresholds OK
 *   1  — this oracle is missing on one or more incomplete items
 *   2  — system incomplete items exist (stuck below threshold), even if we signed
 *   3  — hard failure (RPC / config)
 *
 * Env:
 *   CONFIG              path to oracle config (default ./config)
 *   INTERVAL_SEC        poll interval in watch mode (default 300 = 5 min)
 *   SIG_THRESHOLD       min signatures for Antelope→EVM claim (default 3)
 *   RECEIPT_THRESHOLD   min confirmations for EVM→Antelope (default 5)
 *   MIN_AGE_SEC         ignore items younger than this (in-flight grace, default 120)
 *   PAGES               max pages of 100 rows per table (default 100 ≈ 10k rows)
 *   CHAIN_ID            filter chain_id, or "all" for every chain (default: all)
 *   HYPERION            optional Hyperion base URL for block_num hints
 *   STATUS_PORT         HTTP status API port (default 9090; 0 disables)
 *   STATUS_BIND         bind address (default 0.0.0.0)
 *
 * HTTP (watch mode, when STATUS_PORT > 0):
 *   GET /           HTML status dashboard (safe public fields only)
 *   GET /health     minimal health JSON (for load balancers)
 *   GET /api/status full public status JSON
 *   GET /api/health alias of /health
 */

const config_file = process.env.CONFIG || './config';
process.title = `monitor-teleports ${config_file}`;

const http = require('http');
const { JsonRpc } = require('eosjs');
const fetch = require('node-fetch');

const config = require(config_file);
const rpc = new JsonRpc(config.eos.endpoint, { fetch });

/** In-memory live status for the HTTP API (never holds secrets). */
const live = {
  started_at: new Date().toISOString(),
  last_scan_at: null,
  last_scan_duration_ms: null,
  last_exit_hint: null,
  last_error: null,
  scan_count: 0,
  report: null,
  scanning: false,
};

/**
 * Parse a finite integer. Rejects empty/non-numeric so NaN cannot silently
 * zero out pages or break the watch interval.
 */
function parseFiniteInt(value, name, { min, max } = {}) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required`);
  }
  const raw = String(value).trim();
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid ${name}: ${JSON.stringify(value)} (expected integer)`);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${name}: ${JSON.stringify(value)}`);
  }
  if (min !== undefined && n < min) {
    throw new Error(`${name} must be >= ${min} (got ${n})`);
  }
  if (max !== undefined && n > max) {
    throw new Error(`${name} must be <= ${max} (got ${n})`);
  }
  return n;
}

function parseOptionalFiniteInt(value, name, bounds) {
  if (value === undefined || value === null || value === '') return undefined;
  return parseFiniteInt(value, name, bounds);
}

function parseArgs(argv) {
  const args = {
    once: false,
    json: false,
    allChains: true,
    interval: 300,
    sigThreshold: 3,
    receiptThreshold: 5,
    minAgeSec: 120,
    pages: 100,
    chainId: null, // default: all chains
    hyperion: process.env.HYPERION || '',
    statusPort: 9090,
    statusBind: process.env.STATUS_BIND || '0.0.0.0',
  };

  try {
    const envInterval = parseOptionalFiniteInt(process.env.INTERVAL_SEC, 'INTERVAL_SEC', { min: 1 });
    if (envInterval !== undefined) args.interval = envInterval;

    const envSig = parseOptionalFiniteInt(process.env.SIG_THRESHOLD, 'SIG_THRESHOLD', { min: 1 });
    if (envSig !== undefined) args.sigThreshold = envSig;

    const envReceipt = parseOptionalFiniteInt(process.env.RECEIPT_THRESHOLD, 'RECEIPT_THRESHOLD', {
      min: 1,
    });
    if (envReceipt !== undefined) args.receiptThreshold = envReceipt;

    const envMinAge = parseOptionalFiniteInt(process.env.MIN_AGE_SEC, 'MIN_AGE_SEC', { min: 0 });
    if (envMinAge !== undefined) args.minAgeSec = envMinAge;

    const envPages = parseOptionalFiniteInt(process.env.PAGES, 'PAGES', { min: 1 });
    if (envPages !== undefined) args.pages = envPages;

    const envPort = parseOptionalFiniteInt(process.env.STATUS_PORT, 'STATUS_PORT', { min: 0, max: 65535 });
    if (envPort !== undefined) args.statusPort = envPort;

    const chainEnv = process.env.CHAIN_ID;
    if (chainEnv !== undefined && chainEnv !== '' && chainEnv !== 'all') {
      args.chainId = parseFiniteInt(chainEnv, 'CHAIN_ID', { min: 0 });
      args.allChains = false;
    }

    for (let i = 2; i < argv.length; i++) {
      const a = argv[i];
      if (a === '--once') args.once = true;
      else if (a === '--json') args.json = true;
      else if (a === '--watch') args.once = false;
      else if (a === '--all-chains') {
        args.allChains = true;
        args.chainId = null;
      } else if (a === '--interval' && argv[i + 1]) {
        args.interval = parseFiniteInt(argv[++i], '--interval', { min: 1 });
      } else if (a === '--sig-threshold' && argv[i + 1]) {
        args.sigThreshold = parseFiniteInt(argv[++i], '--sig-threshold', { min: 1 });
      } else if (a === '--receipt-threshold' && argv[i + 1]) {
        args.receiptThreshold = parseFiniteInt(argv[++i], '--receipt-threshold', { min: 1 });
      } else if (a === '--min-age' && argv[i + 1]) {
        args.minAgeSec = parseFiniteInt(argv[++i], '--min-age', { min: 0 });
      } else if (a === '--pages' && argv[i + 1]) {
        args.pages = parseFiniteInt(argv[++i], '--pages', { min: 1 });
      } else if (a === '--port' && argv[i + 1]) {
        args.statusPort = parseFiniteInt(argv[++i], '--port', { min: 0, max: 65535 });
      } else if (a === '--bind' && argv[i + 1]) {
        args.statusBind = argv[++i];
      } else if (a === '--chain-id' && argv[i + 1]) {
        const v = argv[++i];
        if (v === 'all') {
          args.chainId = null;
          args.allChains = true;
        } else {
          args.chainId = parseFiniteInt(v, '--chain-id', { min: 0 });
          args.allChains = false;
        }
      } else if (a === '--hyperion' && argv[i + 1]) {
        args.hyperion = argv[++i];
      } else if (a === '--help' || a === '-h') {
        console.log(`Usage: CONFIG=./config.js node monitor-teleports.js [options]

Options:
  --once                  Single scan, then exit with status code
  --watch                 Continuous mode (default)
  --interval <sec>        Seconds between scans (default 300)
  --json                  One JSON object per scan
  --all-chains            Do not filter by chain_id (default)
  --chain-id <n|all>      Filter to one chain_id
  --sig-threshold <n>     Antelope→EVM signature quorum (default 3)
  --receipt-threshold <n> EVM→Antelope confirmations (default 5)
  --min-age <sec>         Ignore items newer than this (default 120)
  --pages <n>             Max pages of 100 rows per table (default 100)
  --port <n>              HTTP status port (default 9090; 0 disables)
  --bind <addr>           HTTP bind address (default 0.0.0.0)
  --hyperion <url>        Hyperion base for block_num hints
`);
        process.exit(0);
      } else if (a.startsWith('--')) {
        throw new Error(`Unknown option: ${a}`);
      }
    }
  } catch (e) {
    console.error(`Config error: ${e.message}`);
    process.exit(3);
  }

  return args;
}

/**
 * Newest-first scan via reverse=true.
 * For reverse pagination, continue with upper_bound (not lower_bound) so we
 * walk downward without duplicating the last row of the previous page.
 * Chain upper_bound is exclusive for get_table_rows.
 */
async function fetchTable(table, pages) {
  const rows = [];
  const seen = new Set();
  let upper_bound;

  for (let page = 0; page < pages; page++) {
    const params = {
      code: config.eos.teleportContract,
      scope: config.eos.teleportContract,
      table,
      limit: 100,
      reverse: true,
    };
    if (upper_bound !== undefined && upper_bound !== null && upper_bound !== '') {
      params.upper_bound = upper_bound;
    }

    const res = await rpc.get_table_rows(params);
    if (!res.rows || !res.rows.length) break;

    for (const row of res.rows) {
      const key = String(row.id);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }

    if (!res.more) break;

    const last = res.rows[res.rows.length - 1];
    // Prefer API next_key as the next exclusive upper bound for reverse walks.
    if (res.next_key !== undefined && res.next_key !== null && res.next_key !== '') {
      upper_bound = res.next_key;
    } else {
      upper_bound = last.id;
    }
    if (last.id === 0 || last.id === '0') break;
  }

  return rows;
}

function teleportTimeSec(row) {
  if (typeof row.time === 'number') return row.time;
  if (typeof row.time === 'string' && /^\d+$/.test(row.time)) return parseInt(row.time, 10);
  return 0;
}

function receiptTimeSec(row) {
  if (!row.date) return 0;
  const d = Date.parse(row.date.endsWith('Z') ? row.date : row.date + 'Z');
  return Number.isNaN(d) ? 0 : Math.floor(d / 1000);
}

function matchesChain(row, chainId) {
  if (chainId === null || chainId === undefined || Number.isNaN(chainId)) return true;
  return Number(row.chain_id) === Number(chainId);
}

function isOldEnough(tsSec, minAgeSec, nowSec) {
  if (!tsSec) return true;
  return nowSec - tsSec >= minAgeSec;
}

async function hyperionBlockHint(row, hyperion) {
  if (!hyperion || !row.account) return null;
  try {
    const url =
      `${hyperion.replace(/\/$/, '')}/v2/history/get_actions` +
      `?account=${encodeURIComponent(row.account)}` +
      `&filter=${encodeURIComponent(config.eos.teleportContract + ':logteleport')}` +
      `&count=50`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const actions = json.actions || [];
    const eth = (row.eth_address || '').toLowerCase().replace(/^0x/, '');
    const hit = actions.find((a) => {
      const d = a.act && a.act.data;
      if (!d) return false;
      if (String(d.id) === String(row.id)) return true;
      const addr = (d.eth_address || '').toLowerCase().replace(/^0x/, '');
      return d.quantity === row.quantity && addr && eth && addr === eth;
    });
    return hit ? hit.block_num : null;
  } catch (_) {
    return null;
  }
}

function analyseTeleports(rows, opts, nowSec, me) {
  const systemIncomplete = [];
  const missingMine = [];
  const awaitingClaim = [];

  for (const row of rows) {
    if (!matchesChain(row, opts.chainId)) continue;
    const claimed = row.claimed === true || row.claimed === 1;
    if (claimed) continue;

    const ts = teleportTimeSec(row);
    if (!isOldEnough(ts, opts.minAgeSec, nowSec)) continue;

    const sigs = (row.signatures && row.signatures.length) || 0;
    const oracles = row.oracles || [];
    const iSigned = oracles.includes(me);

    if (sigs < opts.sigThreshold) {
      const item = {
        direction: 'antelope_to_evm',
        id: row.id,
        account: row.account,
        quantity: row.quantity,
        chain_id: row.chain_id,
        signatures: sigs,
        threshold: opts.sigThreshold,
        oracles,
        time: ts,
        age_sec: ts ? nowSec - ts : null,
        this_oracle_signed: iSigned,
      };
      systemIncomplete.push(item);
      if (!iSigned) missingMine.push(item);
    } else {
      awaitingClaim.push({
        direction: 'antelope_to_evm',
        id: row.id,
        account: row.account,
        quantity: row.quantity,
        chain_id: row.chain_id,
        signatures: sigs,
        time: ts,
      });
    }
  }

  return { systemIncomplete, missingMine, awaitingClaim };
}

function analyseReceipts(rows, opts, nowSec, me) {
  const systemIncomplete = [];
  const missingMine = [];

  for (const row of rows) {
    if (!matchesChain(row, opts.chainId)) continue;
    const completed = row.completed === true || row.completed === 1;
    if (completed) continue;

    const ts = receiptTimeSec(row);
    if (!isOldEnough(ts, opts.minAgeSec, nowSec)) continue;

    const conf = Number(row.confirmations || 0);
    const approvers = row.approvers || [];
    const iApproved = approvers.includes(me);

    const item = {
      direction: 'evm_to_antelope',
      id: row.id,
      to: row.to,
      ref: row.ref,
      quantity: row.quantity,
      chain_id: row.chain_id,
      confirmations: conf,
      threshold: opts.receiptThreshold,
      approvers,
      time: ts,
      age_sec: ts ? nowSec - ts : null,
      this_oracle_approved: iApproved,
    };

    systemIncomplete.push(item);
    if (!iApproved) missingMine.push(item);
  }

  return { systemIncomplete, missingMine };
}

async function scan(opts) {
  const me = config.eos.oracleAccount;
  const nowSec = Math.floor(Date.now() / 1000);

  const [teleports, receipts] = await Promise.all([
    fetchTable('teleports', opts.pages),
    fetchTable('receipts', opts.pages),
  ]);

  const t = analyseTeleports(teleports, opts, nowSec, me);
  const r = analyseReceipts(receipts, opts, nowSec, me);

  if (opts.hyperion && t.missingMine.length) {
    for (const item of t.missingMine.slice(0, 20)) {
      const row = teleports.find((x) => String(x.id) === String(item.id));
      if (row) item.block_num = await hyperionBlockHint(row, opts.hyperion);
    }
  }

  return {
    ts: new Date().toISOString(),
    oracle: me,
    network: config.network || null,
    chain_id_filter: opts.chainId === null ? 'all' : opts.chainId,
    scanned: {
      teleports: teleports.length,
      receipts: receipts.length,
      pages: opts.pages,
    },
    thresholds: {
      signatures: opts.sigThreshold,
      receipt_confirmations: opts.receiptThreshold,
      min_age_sec: opts.minAgeSec,
    },
    missing_for_this_oracle: {
      antelope_to_evm: t.missingMine,
      evm_to_antelope: r.missingMine,
      count: t.missingMine.length + r.missingMine.length,
    },
    system_incomplete: {
      antelope_to_evm: t.systemIncomplete,
      evm_to_antelope: r.systemIncomplete,
      count: t.systemIncomplete.length + r.systemIncomplete.length,
    },
    awaiting_user_claim: {
      count: t.awaitingClaim.length,
      sample: t.awaitingClaim.slice(0, 10),
    },
  };
}

function printHuman(report) {
  const line = (s) => console.log(s);
  line(`=== teleport monitor ${report.ts} ===`);
  line(
    `oracle=${report.oracle} network=${report.network} chain_id=${report.chain_id_filter} ` +
      `scanned teleports=${report.scanned.teleports} receipts=${report.scanned.receipts}`
  );
  line(
    `thresholds: sigs>=${report.thresholds.signatures} receipts>=${report.thresholds.receipt_confirmations} ` +
      `min_age=${report.thresholds.min_age_sec}s`
  );

  const missT = report.missing_for_this_oracle.antelope_to_evm;
  const missR = report.missing_for_this_oracle.evm_to_antelope;
  const sysT = report.system_incomplete.antelope_to_evm;
  const sysR = report.system_incomplete.evm_to_antelope;

  if (!report.missing_for_this_oracle.count && !report.system_incomplete.count) {
    line('OK — no incomplete teleports/receipts in scan window.');
  }

  if (missT.length) {
    line(`\nMISSING MY SIGNATURE (Antelope→EVM) — ${missT.length}:`);
    for (const x of missT) {
      const blk = x.block_num != null ? ` block=${x.block_num}` : '';
      line(
        `  id=${x.id} chain=${x.chain_id} ${x.quantity} from=${x.account} ` +
          `sigs=${x.signatures}/${x.threshold} oracles=[${x.oracles.join(',')}] age=${x.age_sec}s${blk}`
      );
    }
    const blocks = missT.map((x) => x.block_num).filter((b) => b != null);
    if (blocks.length) {
      line(`  → replay hint: start oracle-eos from block ${Math.min(...blocks)}`);
    } else {
      line(
        `  → if caused by downtime, restart oracle-eos.js with a start block before the gap`
      );
    }
  }

  if (missR.length) {
    line(`\nMISSING MY APPROVAL (EVM→Antelope) — ${missR.length}:`);
    for (const x of missR) {
      line(
        `  id=${x.id} chain=${x.chain_id} ${x.quantity} to=${x.to} ` +
          `conf=${x.confirmations}/${x.threshold} ref=${x.ref} ` +
          `approvers=[${x.approvers.join(',')}] age=${x.age_sec}s`
      );
    }
    line(`  → ensure the matching oracle-eth.js process is running and caught up`);
  }

  const othersT = sysT.filter((x) => x.this_oracle_signed);
  const othersR = sysR.filter((x) => x.this_oracle_approved);
  if (othersT.length || othersR.length) {
    line(
      `\nSYSTEM INCOMPLETE (we already participated) — teleports=${othersT.length} receipts=${othersR.length}`
    );
    for (const x of othersT.slice(0, 20)) {
      line(
        `  teleport id=${x.id} chain=${x.chain_id} ${x.quantity} sigs=${x.signatures}/${x.threshold}`
      );
    }
    for (const x of othersR.slice(0, 20)) {
      line(
        `  receipt id=${x.id} chain=${x.chain_id} ${x.quantity} conf=${x.confirmations}/${x.threshold}`
      );
    }
  }

  if (report.awaiting_user_claim.count) {
    line(
      `\ninfo: ${report.awaiting_user_claim.count} unclaimed teleports with enough signatures (user claim pending)`
    );
  }

  line(
    `\nsummary: missing_mine=${report.missing_for_this_oracle.count} ` +
      `system_incomplete=${report.system_incomplete.count} ` +
      `awaiting_claim=${report.awaiting_user_claim.count}`
  );
}

function exitCode(report) {
  if (report.missing_for_this_oracle.count > 0) return 1;
  if (report.system_incomplete.count > 0) return 2;
  return 0;
}

/** Public teleport row — on-chain fields only, no secrets. */
function publicTeleportItem(x) {
  return {
    id: x.id,
    chain_id: x.chain_id,
    account: x.account,
    quantity: x.quantity,
    signatures: x.signatures,
    threshold: x.threshold,
    oracles: x.oracles,
    age_sec: x.age_sec,
    this_oracle_signed: x.this_oracle_signed,
    block_num: x.block_num != null ? x.block_num : undefined,
  };
}

function publicReceiptItem(x) {
  return {
    id: x.id,
    chain_id: x.chain_id,
    to: x.to,
    // full tx ref is on-chain public data
    ref: x.ref,
    quantity: x.quantity,
    confirmations: x.confirmations,
    threshold: x.threshold,
    approvers: x.approvers,
    age_sec: x.age_sec,
    this_oracle_approved: x.this_oracle_approved,
  };
}

/**
 * Strip anything that could leak ops secrets (RPC URLs, keys, file paths).
 * Output is safe to expose on a public status page.
 */
function toPublicStatus() {
  const report = live.report;
  const healthy =
    live.last_error == null &&
    report != null &&
    report.missing_for_this_oracle.count === 0 &&
    report.system_incomplete.count === 0;

  const level =
    live.last_error != null
      ? 'error'
      : report == null
        ? 'starting'
        : report.missing_for_this_oracle.count > 0
          ? 'degraded'
          : report.system_incomplete.count > 0
            ? 'warning'
            : 'ok';

  const base = {
    service: 'alienteleport-oracle-monitor',
    version: 1,
    healthy,
    status: level,
    status_hint: live.last_exit_hint,
    started_at: live.started_at,
    uptime_sec: Math.floor((Date.now() - Date.parse(live.started_at)) / 1000),
    last_scan_at: live.last_scan_at,
    last_scan_duration_ms: live.last_scan_duration_ms,
    scan_count: live.scan_count,
    scanning: live.scanning,
    last_error: live.last_error,
    // public identity only — never private keys or RPC URLs
    oracle_account: config.eos.oracleAccount,
    network: config.network || null,
    teleport_contract: config.eos.teleportContract,
    node: process.version,
  };

  if (!report) {
    return base;
  }

  const MAX_LIST = 50;
  return {
    ...base,
    chain_id_filter: report.chain_id_filter,
    scanned: report.scanned,
    thresholds: report.thresholds,
    summary: {
      missing_mine: report.missing_for_this_oracle.count,
      system_incomplete: report.system_incomplete.count,
      awaiting_user_claim: report.awaiting_user_claim.count,
    },
    missing_for_this_oracle: {
      count: report.missing_for_this_oracle.count,
      antelope_to_evm: report.missing_for_this_oracle.antelope_to_evm
        .slice(0, MAX_LIST)
        .map(publicTeleportItem),
      evm_to_antelope: report.missing_for_this_oracle.evm_to_antelope
        .slice(0, MAX_LIST)
        .map(publicReceiptItem),
    },
    system_incomplete: {
      count: report.system_incomplete.count,
      antelope_to_evm: report.system_incomplete.antelope_to_evm
        .slice(0, MAX_LIST)
        .map(publicTeleportItem),
      evm_to_antelope: report.system_incomplete.evm_to_antelope
        .slice(0, MAX_LIST)
        .map(publicReceiptItem),
    },
    awaiting_user_claim: {
      count: report.awaiting_user_claim.count,
      sample: (report.awaiting_user_claim.sample || []).map((x) => ({
        id: x.id,
        chain_id: x.chain_id,
        account: x.account,
        quantity: x.quantity,
        signatures: x.signatures,
      })),
    },
  };
}

function renderHtml(status) {
  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const badge =
    status.status === 'ok'
      ? '#0a7'
      : status.status === 'warning'
        ? '#c80'
        : status.status === 'degraded'
          ? '#c40'
          : status.status === 'starting'
            ? '#68a'
            : '#c33';

  const rowList = (items, cols) => {
    if (!items || !items.length) return '<p class="muted">None</p>';
    const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join('');
    const body = items
      .map((item) => {
        const tds = cols
          .map((c) => {
            let v = item[c.key];
            if (Array.isArray(v)) v = v.join(', ');
            return `<td>${esc(v)}</td>`;
          })
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  const s = status.summary || { missing_mine: '—', system_incomplete: '—', awaiting_user_claim: '—' };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="refresh" content="60"/>
  <title>Alien Teleport Oracle Status</title>
  <style>
    :root { color-scheme: dark light; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 1.5rem; line-height: 1.45;
      background: #0f1419; color: #e7ecf1; }
    h1 { font-size: 1.35rem; margin: 0 0 .5rem; }
    h2 { font-size: 1.05rem; margin: 1.5rem 0 .5rem; border-bottom: 1px solid #2a3440; padding-bottom: .3rem; }
    .badge { display: inline-block; padding: .2rem .6rem; border-radius: 999px; background: ${badge};
      color: #fff; font-weight: 600; font-size: .85rem; text-transform: uppercase; }
    .meta { color: #9aa7b5; font-size: .9rem; margin: .4rem 0 1rem; }
    .cards { display: flex; flex-wrap: wrap; gap: .75rem; margin: 1rem 0; }
    .card { background: #1a222c; border: 1px solid #2a3440; border-radius: 8px; padding: .75rem 1rem; min-width: 8rem; }
    .card .n { font-size: 1.6rem; font-weight: 700; }
    .card .l { font-size: .75rem; color: #9aa7b5; text-transform: uppercase; letter-spacing: .04em; }
    table { width: 100%; border-collapse: collapse; font-size: .85rem; overflow-x: auto; display: block; }
    th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #2a3440; vertical-align: top; }
    th { color: #9aa7b5; font-weight: 600; }
    .muted { color: #9aa7b5; }
    a { color: #6cb6ff; }
    code { background: #1a222c; padding: .1rem .3rem; border-radius: 4px; font-size: .85em; }
    footer { margin-top: 2rem; color: #6a7682; font-size: .8rem; }
  </style>
</head>
<body>
  <h1>Alien Teleport Oracle Monitor</h1>
  <div><span class="badge">${esc(status.status)}</span></div>
  <p class="meta">
    oracle <code>${esc(status.oracle_account)}</code>
    · network <code>${esc(status.network)}</code>
    · contract <code>${esc(status.teleport_contract)}</code>
    · chain filter <code>${esc(status.chain_id_filter)}</code>
    · node <code>${esc(status.node)}</code>
  </p>
  <div class="cards">
    <div class="card"><div class="n">${esc(s.missing_mine)}</div><div class="l">Missing mine</div></div>
    <div class="card"><div class="n">${esc(s.system_incomplete)}</div><div class="l">System incomplete</div></div>
    <div class="card"><div class="n">${esc(s.awaiting_user_claim)}</div><div class="l">Awaiting claim</div></div>
    <div class="card"><div class="n">${esc(status.scan_count)}</div><div class="l">Scans</div></div>
  </div>
  <p class="meta">
    last scan ${esc(status.last_scan_at || '—')}
    ${status.last_scan_duration_ms != null ? `(${esc(status.last_scan_duration_ms)} ms)` : ''}
    · uptime ${esc(status.uptime_sec)}s
    ${status.scanning ? '· <strong>scanning now…</strong>' : ''}
    ${status.last_error ? `· error: ${esc(status.last_error)}` : ''}
  </p>

  <h2>Missing this oracle (Antelope → EVM)</h2>
  ${rowList((status.missing_for_this_oracle && status.missing_for_this_oracle.antelope_to_evm) || [], [
    { key: 'id', label: 'ID' },
    { key: 'chain_id', label: 'Chain' },
    { key: 'quantity', label: 'Qty' },
    { key: 'account', label: 'From' },
    { key: 'signatures', label: 'Sigs' },
    { key: 'oracles', label: 'Oracles' },
    { key: 'age_sec', label: 'Age (s)' },
  ])}

  <h2>Missing this oracle (EVM → Antelope)</h2>
  ${rowList((status.missing_for_this_oracle && status.missing_for_this_oracle.evm_to_antelope) || [], [
    { key: 'id', label: 'ID' },
    { key: 'chain_id', label: 'Chain' },
    { key: 'quantity', label: 'Qty' },
    { key: 'to', label: 'To' },
    { key: 'confirmations', label: 'Conf' },
    { key: 'approvers', label: 'Approvers' },
    { key: 'age_sec', label: 'Age (s)' },
  ])}

  <h2>System incomplete (any oracle gap)</h2>
  ${rowList((status.system_incomplete && status.system_incomplete.antelope_to_evm) || [], [
    { key: 'id', label: 'Teleport' },
    { key: 'chain_id', label: 'Chain' },
    { key: 'quantity', label: 'Qty' },
    { key: 'signatures', label: 'Sigs' },
    { key: 'oracles', label: 'Oracles' },
  ])}
  ${rowList((status.system_incomplete && status.system_incomplete.evm_to_antelope) || [], [
    { key: 'id', label: 'Receipt' },
    { key: 'chain_id', label: 'Chain' },
    { key: 'quantity', label: 'Qty' },
    { key: 'confirmations', label: 'Conf' },
    { key: 'approvers', label: 'Approvers' },
  ])}

  <footer>
    Read-only public status · no private keys or RPC credentials ·
    <a href="/api/status">/api/status</a> ·
    <a href="/health">/health</a> ·
    auto-refresh 60s
  </footer>
</body>
</html>`;
}

function startStatusServer(opts) {
  if (!opts.statusPort) {
    console.log('HTTP status API disabled (STATUS_PORT=0)');
    return null;
  }

  const server = http.createServer((req, res) => {
    // Read-only: reject non-GET
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname.replace(/\/+$/, '') || '/';

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
      if (path === '/health' || path === '/api/health') {
        const st = toPublicStatus();
        const body = JSON.stringify({
          ok: st.healthy,
          status: st.status,
          status_hint: st.status_hint,
          last_scan_at: st.last_scan_at,
          scanning: st.scanning,
        });
        // 200 even when degraded so LB doesn't flap; clients inspect ok/status
        send(200, 'application/json; charset=utf-8', body);
        return;
      }

      if (path === '/api/status' || path === '/api/v1/status') {
        send(200, 'application/json; charset=utf-8', JSON.stringify(toPublicStatus(), null, 2));
        return;
      }

      if (path === '/' || path === '/status') {
        send(200, 'text/html; charset=utf-8', renderHtml(toPublicStatus()));
        return;
      }

      send(404, 'application/json; charset=utf-8', JSON.stringify({ error: 'not_found' }));
    } catch (e) {
      send(500, 'application/json; charset=utf-8', JSON.stringify({ error: 'internal' }));
    }
  });

  server.listen(opts.statusPort, opts.statusBind, () => {
    console.log(`HTTP status API listening on http://${opts.statusBind}:${opts.statusPort}/`);
    console.log(`  HTML  GET /`);
    console.log(`  JSON  GET /api/status`);
    console.log(`  health GET /health`);
  });

  server.on('error', (e) => {
    console.error(`HTTP status server error: ${e.message}`);
  });

  return server;
}

async function main() {
  const opts = parseArgs(process.argv);

  if (!config.eos || !config.eos.endpoint || !config.eos.teleportContract) {
    console.error('Invalid config: need eos.endpoint and eos.teleportContract');
    process.exit(3);
  }
  if (!config.eos.oracleAccount) {
    console.error('Invalid config: need eos.oracleAccount to detect missing participation');
    process.exit(3);
  }

  console.log(
    `Teleport monitor starting (oracle=${config.eos.oracleAccount}, ` +
      `interval=${opts.interval}s, chain_id=${opts.chainId === null ? 'all' : opts.chainId}, ` +
      `pages=${opts.pages})`
  );

  const runOnce = async () => {
    live.scanning = true;
    const t0 = Date.now();
    try {
      const report = await scan(opts);
      live.report = report;
      live.last_scan_at = new Date().toISOString();
      live.last_scan_duration_ms = Date.now() - t0;
      live.last_error = null;
      live.scan_count += 1;
      live.last_exit_hint = exitCode(report);
      live.scanning = false;

      if (opts.json) {
        console.log(JSON.stringify(report));
      } else {
        printHuman(report);
      }
      return live.last_exit_hint;
    } catch (e) {
      live.scanning = false;
      live.last_error = String(e.message || e);
      live.last_scan_at = new Date().toISOString();
      live.last_scan_duration_ms = Date.now() - t0;
      live.last_exit_hint = 3;
      console.error(`monitor error: ${e.message || e}`);
      if (opts.json) {
        console.log(JSON.stringify({ error: String(e.message || e), ts: new Date().toISOString() }));
      }
      return 3;
    }
  };

  if (opts.once) {
    const code = await runOnce();
    process.exit(code);
  }

  // Watch mode: serve live status + periodic scans
  startStatusServer(opts);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const code = await runOnce();
    if (!opts.json) {
      console.log(`\n(next scan in ${opts.interval}s; status_hint=${code})\n`);
    }
    await new Promise((r) => setTimeout(r, opts.interval * 1000));
  }
}

main();
