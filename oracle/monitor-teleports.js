#!/usr/bin/env node

/**
 * Alien Worlds TLM teleport oracle monitor (entry point).
 *
 * Scans WAX teleports/receipts for missing oracle participation, tracks
 * chain-reader lag (PM2 + block files + logs), and serves a public status UI.
 *
 * Modules live under ./lib/monitor/ — keep this file thin.
 *
 *   CONFIG=./config-eth.js node monitor-teleports.js
 *   CONFIG=./config-eth.js node monitor-teleports.js --once
 *
 * Exit codes (--once): 0 ok · 1 missing mine · 2 system incomplete · 3 error
 */

'use strict';

process.title = `monitor-teleports ${process.env.CONFIG || './config'}`;

const { config, live, ANTELOPE_CHAIN } = require('./lib/monitor/context');
const { parseArgs } = require('./lib/monitor/args');
const { scan, exitCode, printHuman } = require('./lib/monitor/chain-scan');
const { startStatusServer } = require('./lib/monitor/server');

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
      `antelope=${ANTELOPE_CHAIN}, interval=${opts.interval}s, ` +
      `chain_id=${opts.chainId === null ? 'all' : opts.chainId}, pages=${opts.pages})`
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
