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
 */

const config_file = process.env.CONFIG || './config';
process.title = `monitor-teleports ${config_file}`;

const { JsonRpc } = require('eosjs');
const fetch = require('node-fetch');

const config = require(config_file);
const rpc = new JsonRpc(config.eos.endpoint, { fetch });

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
    try {
      const report = await scan(opts);
      if (opts.json) {
        console.log(JSON.stringify(report));
      } else {
        printHuman(report);
      }
      return exitCode(report);
    } catch (e) {
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
