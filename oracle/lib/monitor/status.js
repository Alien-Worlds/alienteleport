'use strict';

const { config, live, ANTELOPE_CHAIN } = require('./context');

const CHAIN_NAMES = {
  0: 'legacy/unknown',
  1: 'Ethereum',
  2: 'BSC',
};

const DEFAULT_HISTORICAL_AGE_SEC = 365 * 24 * 3600;

function chainLabel(id) {
  const n = Number(id);
  return CHAIN_NAMES[n] != null ? `${CHAIN_NAMES[n]} (${n})` : `chain ${id}`;
}

function formatAge(sec) {
  if (sec == null || sec === '') return '—';
  const s = Number(sec);
  if (!Number.isFinite(s) || s < 0) return String(sec);
  if (s < 120) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  const d = Math.floor(s / 86400);
  if (d < 60) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

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
    ref: x.ref,
    quantity: x.quantity,
    confirmations: x.confirmations,
    threshold: x.threshold,
    approvers: x.approvers,
    age_sec: x.age_sec,
    this_oracle_approved: x.this_oracle_approved,
  };
}

function listMissT(report) {
  return report.missing_for_this_oracle.wax_to_evm || report.missing_for_this_oracle.antelope_to_evm || [];
}
function listMissR(report) {
  return report.missing_for_this_oracle.evm_to_wax || report.missing_for_this_oracle.evm_to_antelope || [];
}
function listSysT(report) {
  return report.system_incomplete.wax_to_evm || report.system_incomplete.antelope_to_evm || [];
}
function listSysR(report) {
  return report.system_incomplete.evm_to_wax || report.system_incomplete.evm_to_antelope || [];
}

function historicalAgeSec(report) {
  return (report && report.thresholds && report.thresholds.historical_age_sec) || DEFAULT_HISTORICAL_AGE_SEC;
}

function isHistorical(item, histAge) {
  const age = item && item.age_sec;
  return age != null && Number.isFinite(Number(age)) && Number(age) >= histAge;
}

function splitAge(items, histAge) {
  const recent = [];
  const historical = [];
  for (const x of items || []) {
    if (isHistorical(x, histAge)) historical.push(x);
    else recent.push(x);
  }
  return { recent, historical };
}

/**
 * Specific operational status — only RECENT (< historical age) items raise alarms.
 * Historical rows are informational.
 */
function deriveStatus(report) {
  const wax = (report && report.antelope_chain) || ANTELOPE_CHAIN;

  if (live.last_error) {
    return {
      status: 'scan_error',
      status_label: 'Scan error',
      status_detail: `Chain scan failed: ${live.last_error}`,
      severity: 'critical',
      reasons: [{ code: 'scan_error', message: live.last_error }],
      actions: [],
    };
  }
  if (!report) {
    return {
      status: 'starting',
      status_label: 'Starting up',
      status_detail: 'Waiting for the first chain scan to finish.',
      severity: 'info',
      reasons: [],
      actions: [],
    };
  }

  const histAge = historicalAgeSec(report);
  const missT = splitAge(listMissT(report), histAge);
  const missR = splitAge(listMissR(report), histAge);
  const sysT = splitAge(listSysT(report), histAge);
  const sysR = splitAge(listSysR(report), histAge);

  const stuckT = sysT.recent.filter((x) => x.this_oracle_signed);
  const stuckR = sysR.recent.filter((x) => x.this_oracle_approved);

  const histCount =
    missT.historical.length +
    missR.historical.length +
    sysT.historical.length +
    sysR.historical.length;

  const reasons = [];
  const actions = [];

  if (missT.recent.length) {
    reasons.push({
      code: 'oracle_missing_signatures',
      message: `This oracle has not signed ${missT.recent.length} recent ${wax}→EVM teleport(s) still below signature quorum.`,
      count: missT.recent.length,
      direction: 'wax_to_evm',
      window: 'recent',
    });
    actions.push({
      title: `Catch up ${wax} SHiP reader`,
      detail: `Restart oracle-eos (AW-WAX-*-ORACLE) from a block before the gap so missing logteleport events are re-signed.`,
      target: 'wax_reader',
    });
  }
  if (missR.recent.length) {
    reasons.push({
      code: 'oracle_missing_approvals',
      message: `This oracle has not approved ${missR.recent.length} recent EVM→${wax} receipt(s) that are still incomplete.`,
      count: missR.recent.length,
      direction: 'evm_to_wax',
      window: 'recent',
    });
    actions.push({
      title: 'Catch up EVM reader(s)',
      detail: 'Ensure oracle-eth (AW-ETH-ORACLE / AW-BSC-ORACLE) is online and not lagging chain tip.',
      target: 'evm_reader',
    });
  }
  if (stuckT.length) {
    reasons.push({
      code: 'stuck_teleports',
      message: `${stuckT.length} recent ${wax}→EVM teleport(s) still below quorum after this oracle signed.`,
      count: stuckT.length,
      direction: 'wax_to_evm',
      window: 'recent',
    });
  }
  if (stuckR.length) {
    reasons.push({
      code: 'stuck_receipts',
      message: `${stuckR.length} recent EVM→${wax} receipt(s) still incomplete after this oracle approved.`,
      count: stuckR.length,
      direction: 'evm_to_wax',
      window: 'recent',
    });
  }
  if (histCount > 0) {
    reasons.push({
      code: 'historical_incomplete',
      message: `${histCount} incomplete row(s) older than ${Math.round(histAge / 86400)} days (shown under Historical; not treated as active incidents).`,
      count: histCount,
      window: 'historical',
    });
  }

  const cr = report.chain_readers;
  if (cr && cr.readers) {
    for (const r of cr.readers) {
      if (r.health === 'lagging') {
        reasons.push({
          code: 'reader_lagging',
          message: `${r.name} is lagging by ${r.lag_blocks} blocks (cursor ${r.cursor_block} / head ${r.chain_head}).`,
          count: r.lag_blocks,
          reader: r.name,
          window: 'recent',
        });
      } else if (r.health === 'not_found' || r.health === 'stopped') {
        reasons.push({
          code: 'reader_offline',
          message: `${r.name} is ${r.health.replace('_', ' ')}.`,
          reader: r.name,
          window: 'recent',
        });
        actions.push({
          title: `Start ${r.name}`,
          detail: `PM2 process is not online (${r.health}).`,
          target: r.name,
        });
      }
    }
  }

  const miss = missT.recent.length + missR.recent.length;
  const stuck = stuckT.length + stuckR.length;
  const readerIssues = cr && cr.summary && (cr.summary.lagging > 0 || cr.summary.offline > 0);

  if (miss > 0 && stuck > 0) {
    return {
      status: 'oracle_action_and_stuck',
      status_label: 'Action needed + stuck items',
      status_detail: `This oracle is missing on ${miss} recent item(s) on ${wax}. Separately, ${stuck} recent item(s) remain incomplete after we participated.${histCount ? ` (${histCount} historical incomplete rows nested below.)` : ''}`,
      severity: 'critical',
      reasons,
      actions,
    };
  }
  if (missT.recent.length && missR.recent.length) {
    return {
      status: 'oracle_action_needed',
      status_label: 'Oracle action needed',
      status_detail: `Missing ${missT.recent.length} recent ${wax}→EVM signature(s) and ${missR.recent.length} recent EVM→${wax} approval(s).`,
      severity: 'critical',
      reasons,
      actions,
    };
  }
  if (missT.recent.length) {
    return {
      status: 'oracle_missing_signatures',
      status_label: `Missing ${wax}→EVM signatures`,
      status_detail: `This oracle has not signed ${missT.recent.length} recent ${wax}→EVM teleport(s). Check the ${wax} SHiP reader.`,
      severity: 'critical',
      reasons,
      actions,
    };
  }
  if (missR.recent.length) {
    return {
      status: 'oracle_missing_approvals',
      status_label: `Missing EVM→${wax} approvals`,
      status_detail: `This oracle has not approved ${missR.recent.length} recent EVM→${wax} receipt(s). Check the EVM watcher.`,
      severity: 'critical',
      reasons,
      actions,
    };
  }
  if (readerIssues && stuck === 0) {
    return {
      status: 'readers_behind',
      status_label: 'Readers behind chain tip',
      status_detail: `Oracle processes are lagging or offline on ${wax}/EVM. Recent bridge tables look fine.${histCount ? ` (${histCount} historical incomplete rows nested below.)` : ''}`,
      severity: 'warning',
      reasons,
      actions,
    };
  }
  if (stuck > 0) {
    return {
      status: 'stuck_bridge_items',
      status_label: 'Recent stuck bridge items',
      status_detail: `${stuck} recent incomplete item(s) on ${wax} where this oracle already participated.${histCount ? ` (${histCount} historical incomplete rows nested below.)` : ''}`,
      severity: 'warning',
      reasons,
      actions,
    };
  }
  if (histCount > 0) {
    return {
      status: 'ok_with_historical',
      status_label: 'All clear (historical noise)',
      status_detail: `No recent incomplete items on ${wax}. ${histCount} incomplete row(s) older than ${Math.round(histAge / 86400)} days are listed under Historical only.`,
      severity: 'ok',
      reasons,
      actions: [],
    };
  }

  return {
    status: 'ok',
    status_label: 'All clear',
    status_detail: `No incomplete ${wax} teleports/receipts requiring attention in the scan window.`,
    severity: 'ok',
    reasons: [],
    actions: [],
  };
}

function enrichTeleport(x) {
  return {
    ...publicTeleportItem(x),
    chain_name: chainLabel(x.chain_id),
    age: formatAge(x.age_sec),
    historical: false,
  };
}
function enrichReceipt(x) {
  return {
    ...publicReceiptItem(x),
    chain_name: chainLabel(x.chain_id),
    age: formatAge(x.age_sec),
    historical: false,
  };
}
function markHistorical(list) {
  return list.map((x) => ({ ...x, historical: true }));
}

function packLists(recent, historical, enrich, max = 50) {
  return {
    recent: recent.slice(0, max).map(enrich),
    historical: markHistorical(historical.slice(0, max).map(enrich)),
    recent_count: recent.length,
    historical_count: historical.length,
    // flat combined (recent first) for simple consumers
    all: [
      ...recent.slice(0, max).map(enrich),
      ...markHistorical(historical.slice(0, Math.max(0, max - recent.length)).map(enrich)),
    ],
  };
}

function toPublicStatus() {
  const report = live.report;
  const derived = deriveStatus(report);
  // ok and ok_with_historical both count as healthy for LB purposes
  const healthy = derived.severity === 'ok';
  const wax = (report && report.antelope_chain) || ANTELOPE_CHAIN;

  const base = {
    service: 'alienteleport-oracle-monitor',
    version: 4,
    healthy,
    status: derived.status,
    status_label: derived.status_label,
    status_detail: derived.status_detail,
    severity: derived.severity,
    reasons: derived.reasons,
    actions: derived.actions || [],
    status_hint: live.last_exit_hint,
    started_at: live.started_at,
    uptime_sec: Math.floor((Date.now() - Date.parse(live.started_at)) / 1000),
    last_scan_at: live.last_scan_at,
    last_scan_duration_ms: live.last_scan_duration_ms,
    scan_count: live.scan_count,
    scanning: live.scanning,
    last_error: live.last_error,
    antelope_chain: wax,
    oracle_account: config.eos.oracleAccount,
    network: config.network || null,
    teleport_contract: config.eos.teleportContract,
    node: process.version,
    brand: {
      name: 'Alien Worlds',
      product: 'TLM Teleport',
      site: 'https://alienworlds.io/',
      teleport: 'https://teleport.alienworlds.io/',
    },
  };

  if (!report) return base;

  const histAge = historicalAgeSec(report);
  const missT = splitAge(listMissT(report), histAge);
  const missR = splitAge(listMissR(report), histAge);
  const sysT = splitAge(listSysT(report), histAge);
  const sysR = splitAge(listSysR(report), histAge);

  const packT = packLists(missT.recent, missT.historical, enrichTeleport);
  const packR = packLists(missR.recent, missR.historical, enrichReceipt);
  const packSysT = packLists(sysT.recent, sysT.historical, enrichTeleport);
  const packSysR = packLists(sysR.recent, sysR.historical, enrichReceipt);

  const recentMissing = missT.recent.length + missR.recent.length;
  const histMissing = missT.historical.length + missR.historical.length;
  const recentStuck =
    sysT.recent.filter((x) => x.this_oracle_signed).length +
    sysR.recent.filter((x) => x.this_oracle_approved).length;
  const histIncomplete =
    missT.historical.length +
    missR.historical.length +
    // unique-ish: system historical covers incomplete including missing
    sysT.historical.length +
    sysR.historical.length;

  return {
    ...base,
    chain_id_filter: report.chain_id_filter,
    scanned: report.scanned,
    thresholds: report.thresholds,
    chain_readers: report.chain_readers || null,
    summary: {
      // recent-only (drives alarm)
      missing_mine: recentMissing,
      missing_signatures: missT.recent.length,
      missing_approvals: missR.recent.length,
      system_incomplete: sysT.recent.length + sysR.recent.length,
      stuck_after_our_participation: recentStuck,
      // historical (informational)
      historical_incomplete: histIncomplete,
      historical_missing_mine: histMissing,
      awaiting_user_claim: report.awaiting_user_claim.count,
      // totals including historical
      missing_mine_total: report.missing_for_this_oracle.count,
      system_incomplete_total: report.system_incomplete.count,
    },
    missing_for_this_oracle: {
      count: recentMissing,
      historical_count: histMissing,
      wax_to_evm: packT,
      antelope_to_evm: packT,
      evm_to_wax: packR,
      evm_to_antelope: packR,
    },
    system_incomplete: {
      count: sysT.recent.length + sysR.recent.length,
      historical_count: sysT.historical.length + sysR.historical.length,
      wax_to_evm: packSysT,
      antelope_to_evm: packSysT,
      evm_to_wax: packSysR,
      evm_to_antelope: packSysR,
    },
    awaiting_user_claim: {
      count: report.awaiting_user_claim.count,
      sample: (report.awaiting_user_claim.sample || []).map((x) => ({
        id: x.id,
        chain_id: x.chain_id,
        chain_name: chainLabel(x.chain_id),
        account: x.account,
        quantity: x.quantity,
        signatures: x.signatures,
      })),
    },
  };
}

module.exports = {
  toPublicStatus,
  deriveStatus,
  chainLabel,
  formatAge,
  splitAge,
  isHistorical,
  historicalAgeSec,
};
