'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { config, configFile, rpc, ANTELOPE_CHAIN, PM2_LOG_DIR } = require('./context');

function lastRegexMatch(filePath, regex) {
  try {
    const st = fs.statSync(filePath);
    const size = st.size;
    const fd = fs.openSync(filePath, 'r');
    const readSize = Math.min(size, 80 * 1024);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, size - readSize));
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    let last = null;
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
    for (const m of text.matchAll(re)) last = m;
    return last;
  } catch (_) {
    return null;
  }
}

function readBlockFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

function pm2Jlist() {
  return new Promise((resolve) => {
    execFile(
      'pm2',
      ['jlist'],
      { timeout: 8000, maxBuffer: 12 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const list = JSON.parse(stdout);
          resolve(Array.isArray(list) ? list : []);
        } catch (_) {
          resolve([]);
        }
      }
    );
  });
}

function loadEvmConfigs() {
  const dir = path.dirname(path.resolve(configFile));
  let paths = [];
  if (process.env.READER_CONFIGS) {
    paths = process.env.READER_CONFIGS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((p) => (path.isAbsolute(p) ? p : path.join(dir, p)));
  } else {
    for (const name of ['config-eth.js', 'config-bsc.js', 'config.js']) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) paths.push(p);
    }
    paths.unshift(path.resolve(configFile));
  }
  const seen = new Set();
  const configs = [];
  for (const p of paths) {
    const key = path.resolve(p);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const c = require(key);
      if (c && c.eth && c.eth.endpoint) configs.push({ path: key, config: c });
    } catch (_) {
      /* skip */
    }
  }
  return configs;
}

async function fetchEvmTip(endpoint) {
  try {
    const ethers = require('ethers');
    const provider = new ethers.providers.StaticJsonRpcProvider(endpoint);
    provider.pollingInterval = 60_000;
    const block = await Promise.race([
      provider.getBlock('latest'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12_000)),
    ]);
    return block && block.number != null ? Number(block.number) : null;
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

/**
 * Snapshot of chain heads + local reader progress (PM2 + block files + logs).
 * Public-safe fields only.
 */
async function collectReaders() {
  const dir = path.dirname(path.resolve(configFile));
  const now = Date.now();

  let waxHead = null;
  let waxHeadError = null;
  try {
    const info = await rpc.get_info();
    waxHead = Number(info.head_block_num);
  } catch (e) {
    waxHeadError = String(e.message || e);
  }

  const pm2List = await pm2Jlist();
  const pm2ByName = {};
  for (const p of pm2List) {
    if (p && p.name) {
      pm2ByName[p.name] = {
        name: p.name,
        status: p.pm2_env && p.pm2_env.status,
        restarts: p.pm2_env ? p.pm2_env.restart_time : null,
        pid: p.pid || 0,
        uptime_ms:
          p.pm2_env && p.pm2_env.pm_uptime ? Math.max(0, now - p.pm2_env.pm_uptime) : null,
        node_version: p.pm2_env && p.pm2_env.node_version,
      };
    }
  }

  // Prefer durable cursor files written by oracle-eos.js; fall back to coarse logs.
  const waxOracleAccount = config.eos.oracleAccount || 'unknown';
  const waxReaders = [
    { name: 'AW-WAX-ETH-ORACLE', role: 'wax_reader', pair: 'ETH' },
    { name: 'AW-WAX-BSC-ORACLE', role: 'wax_reader', pair: 'BSC' },
  ].map((spec) => {
    const cursorFile = path.join(
      dir,
      `.oracle_WAX_${spec.pair}_block-${waxOracleAccount}`
    );
    const fromFile = readBlockFile(cursorFile);
    const logOut = path.join(PM2_LOG_DIR, `${spec.name}-out.log`);
    const mCurrent = lastRegexMatch(logOut, /Current:\s*(\d+)/);
    const mRecv = lastRegexMatch(logOut, /received block\s+(\d+)/);
    const fromLog =
      (mCurrent && Number(mCurrent[1])) || (mRecv && Number(mRecv[1])) || null;
    // File is authoritative when present; log is fallback only
    const current = fromFile != null ? fromFile : fromLog;
    const source = fromFile != null ? 'cursor_file' : fromLog != null ? 'log' : 'none';
    const pm = pm2ByName[spec.name] || null;
    const lag = waxHead != null && current != null ? Math.max(0, waxHead - current) : null;
    let health = 'unknown';
    if (pm && pm.status === 'online') {
      if (lag == null) health = 'online';
      else if (lag <= 50) health = 'synced';
      else if (lag <= 500) health = 'catching_up';
      else if (lag <= 5000) health = 'catching_up';
      else health = 'lagging';
    } else if (pm && pm.status) health = pm.status;
    else health = 'not_found';

    return {
      name: spec.name,
      role: spec.role,
      antelope_chain: ANTELOPE_CHAIN,
      pair_network: spec.pair,
      process: pm,
      cursor_block: current,
      cursor_source: source,
      chain_head: waxHead,
      lag_blocks: lag,
      health,
    };
  });

  const evmReaders = [];
  for (const { config: c } of loadEvmConfigs()) {
    const network = c.network || `chain_${c.eth.chainId}`;
    const oracleAcct = c.eth.oracleAccount || 'unknown';
    const blockFile = path.join(dir, `.oracle_${network}_block-${oracleAcct}`);
    const saved = readBlockFile(blockFile);
    const tipOrErr = await fetchEvmTip(c.eth.endpoint);
    const tip = typeof tipOrErr === 'number' ? tipOrErr : null;
    const tipError = tipOrErr && tipOrErr.error ? tipOrErr.error : null;

    const pmName =
      network === 'ETH' ? 'AW-ETH-ORACLE' : network === 'BSC' ? 'AW-BSC-ORACLE' : null;
    const pm = (pmName && pm2ByName[pmName]) || null;

    const logOut = pmName ? path.join(PM2_LOG_DIR, `${pmName}-out.log`) : null;
    const mEv = logOut && lastRegexMatch(logOut, /Getting events from block (\d+) to (\d+)/);
    const logTo = mEv ? Number(mEv[2]) : null;
    const mWait = logOut && lastRegexMatch(logOut, /Not waiting\.\.\.\s*(\d+)\s*-\s*(\d+)/);
    const logTip = mWait ? Number(mWait[1]) : null;

    const cursor = logTo != null ? logTo : saved;
    const head = tip != null ? tip : logTip;
    const lag = head != null && cursor != null ? Math.max(0, head - cursor) : null;

    let health = 'unknown';
    if (pm && pm.status === 'online') {
      if (lag == null) health = 'online';
      else if (lag <= 30) health = 'synced';
      else if (lag <= 5000) health = 'catching_up';
      else health = 'lagging';
    } else if (pm && pm.status) health = pm.status;
    else health = 'not_found';

    evmReaders.push({
      name: pmName || `evm-${network}`,
      role: 'evm_reader',
      network,
      chain_id: c.eth.chainId != null ? Number(c.eth.chainId) : null,
      process: pm,
      cursor_block: cursor,
      saved_block: saved,
      chain_head: head,
      lag_blocks: lag,
      health,
      tip_error: tipError,
    });
  }

  const readers = [...waxReaders, ...evmReaders];

  return {
    antelope_chain: ANTELOPE_CHAIN,
    wax: {
      chain: ANTELOPE_CHAIN,
      head_block: waxHead,
      error: waxHeadError,
    },
    readers,
    summary: {
      reader_count: readers.length,
      online: readers.filter((r) => r.process && r.process.status === 'online').length,
      synced: readers.filter((r) => r.health === 'synced').length,
      catching_up: readers.filter((r) => r.health === 'catching_up').length,
      lagging: readers.filter((r) => r.health === 'lagging').length,
      offline: readers.filter(
        (r) => r.health === 'stopped' || r.health === 'not_found' || r.health === 'errored'
      ).length,
    },
  };
}

module.exports = { collectReaders };
