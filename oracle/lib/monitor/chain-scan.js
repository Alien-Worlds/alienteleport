'use strict';

const fetch = require('node-fetch');
const { config, rpc, ANTELOPE_CHAIN } = require('./context');
const { collectReaders } = require('./readers');

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
  const d = Date.parse(row.date.endsWith('Z') ? row.date : `${row.date}Z`);
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
      `&filter=${encodeURIComponent(`${config.eos.teleportContract}:logteleport`)}` +
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
        direction: 'wax_to_evm',
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
        direction: 'wax_to_evm',
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
      direction: 'evm_to_wax',
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

  const [teleports, receipts, readers] = await Promise.all([
    fetchTable('teleports', opts.pages),
    fetchTable('receipts', opts.pages),
    collectReaders(),
  ]);

  // Mark readers snapshot time for the HTTP layer
  const { live } = require('./context');
  live.last_readers_at = new Date().toISOString();

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
    antelope_chain: ANTELOPE_CHAIN,
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
      historical_age_sec: opts.historicalAgeSec || 365 * 24 * 3600,
    },
    missing_for_this_oracle: {
      wax_to_evm: t.missingMine,
      antelope_to_evm: t.missingMine,
      evm_to_wax: r.missingMine,
      evm_to_antelope: r.missingMine,
      count: t.missingMine.length + r.missingMine.length,
    },
    system_incomplete: {
      wax_to_evm: t.systemIncomplete,
      antelope_to_evm: t.systemIncomplete,
      evm_to_wax: r.systemIncomplete,
      evm_to_antelope: r.systemIncomplete,
      count: t.systemIncomplete.length + r.systemIncomplete.length,
    },
    awaiting_user_claim: {
      count: t.awaitingClaim.length,
      sample: t.awaitingClaim.slice(0, 10),
    },
    chain_readers: readers,
  };
}

function isHistorical(item, historicalAgeSec) {
  const age = item && item.age_sec;
  return age != null && Number.isFinite(age) && age >= historicalAgeSec;
}

/** Exit codes ignore historical (>1y) table rows — only recent gaps alert. */
function exitCode(report) {
  const histAge = (report.thresholds && report.thresholds.historical_age_sec) || 365 * 24 * 3600;
  const missT = (
    report.missing_for_this_oracle.wax_to_evm ||
    report.missing_for_this_oracle.antelope_to_evm ||
    []
  ).filter((x) => !isHistorical(x, histAge));
  const missR = (
    report.missing_for_this_oracle.evm_to_wax ||
    report.missing_for_this_oracle.evm_to_antelope ||
    []
  ).filter((x) => !isHistorical(x, histAge));
  const sysT = (
    report.system_incomplete.wax_to_evm ||
    report.system_incomplete.antelope_to_evm ||
    []
  ).filter((x) => !isHistorical(x, histAge));
  const sysR = (
    report.system_incomplete.evm_to_wax ||
    report.system_incomplete.evm_to_antelope ||
    []
  ).filter((x) => !isHistorical(x, histAge));

  if (missT.length + missR.length > 0) return 1;
  if (sysT.length + sysR.length > 0) return 2;
  const cr = report.chain_readers;
  if (cr && cr.summary && cr.summary.offline > 0 && cr.summary.online === 0) return 2;
  return 0;
}

function printHuman(report) {
  const line = (s) => console.log(s);
  const wax = report.antelope_chain || 'WAX';
  line(`=== teleport monitor ${report.ts} ===`);
  line(
    `oracle=${report.oracle} antelope=${wax} network=${report.network} chain_id=${report.chain_id_filter} ` +
      `scanned teleports=${report.scanned.teleports} receipts=${report.scanned.receipts}`
  );
  if (report.chain_readers && report.chain_readers.wax) {
    line(
      `${wax} head=${report.chain_readers.wax.head_block} ` +
        `readers online=${report.chain_readers.summary.online}/${report.chain_readers.summary.reader_count} ` +
        `synced=${report.chain_readers.summary.synced} catching_up=${report.chain_readers.summary.catching_up} ` +
        `lagging=${report.chain_readers.summary.lagging}`
    );
    for (const r of report.chain_readers.readers) {
      line(
        `  ${r.name}: health=${r.health} cursor=${r.cursor_block} head=${r.chain_head} lag=${r.lag_blocks}`
      );
    }
  }
  line(
    `thresholds: sigs>=${report.thresholds.signatures} receipts>=${report.thresholds.receipt_confirmations} ` +
      `min_age=${report.thresholds.min_age_sec}s`
  );

  const missT = report.missing_for_this_oracle.wax_to_evm || report.missing_for_this_oracle.antelope_to_evm;
  const missR = report.missing_for_this_oracle.evm_to_wax || report.missing_for_this_oracle.evm_to_antelope;
  const sysT = report.system_incomplete.wax_to_evm || report.system_incomplete.antelope_to_evm;
  const sysR = report.system_incomplete.evm_to_wax || report.system_incomplete.evm_to_antelope;

  if (!report.missing_for_this_oracle.count && !report.system_incomplete.count) {
    line(`OK — no incomplete ${wax} teleports/receipts in scan window.`);
  }

  if (missT.length) {
    line(`\nMISSING MY SIGNATURE (${wax}→EVM) — ${missT.length}:`);
    for (const x of missT) {
      line(
        `  id=${x.id} chain=${x.chain_id} ${x.quantity} from=${x.account} ` +
          `sigs=${x.signatures}/${x.threshold} age=${x.age_sec}s`
      );
    }
  }
  if (missR.length) {
    line(`\nMISSING MY APPROVAL (EVM→${wax}) — ${missR.length}:`);
    for (const x of missR) {
      line(
        `  id=${x.id} chain=${x.chain_id} ${x.quantity} to=${x.to} ` +
          `conf=${x.confirmations}/${x.threshold} age=${x.age_sec}s`
      );
    }
  }

  const othersT = sysT.filter((x) => x.this_oracle_signed);
  const othersR = sysR.filter((x) => x.this_oracle_approved);
  if (othersT.length || othersR.length) {
    line(
      `\nSTUCK AFTER OUR PARTICIPATION — teleports=${othersT.length} receipts=${othersR.length}`
    );
  }

  line(
    `\nsummary: missing_mine=${report.missing_for_this_oracle.count} ` +
      `system_incomplete=${report.system_incomplete.count} ` +
      `awaiting_claim=${report.awaiting_user_claim.count}`
  );
}

module.exports = { scan, exitCode, printHuman, fetchTable };
