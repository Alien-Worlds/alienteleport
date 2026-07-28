'use strict';

/**
 * SHiP stream recovery policy for the WAX oracle.
 *
 * eosio-statereceiver only reconnects on websocket *close*. Half-open sockets
 * (no close, no further blocks) leave the process online with a frozen cursor.
 *
 * Recovery ladder (resets to step 0 after block progress resumes):
 *   1) force-close socket → library reconnect (preserves in-flight work)
 *   2) rebuild StateReceiver from durable cursor
 *   3) after maxRecoveries failed attempts → give up (caller may process.exit)
 *
 * This module is intentionally free of SHiP/eosjs deps so it can be unit-tested.
 */

const DEFAULTS = {
    stallMs: 120_000,
    checkMs: 30_000,
    wsPingMs: 30_000,
    maxRecoveries: 4,
};

function parseEnvInt(name, fallback, env = process.env) {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

function configFromEnv(env = process.env) {
    return {
        stallMs: parseEnvInt('SHIP_STALL_MS', DEFAULTS.stallMs, env),
        checkMs: parseEnvInt('SHIP_STALL_CHECK_MS', DEFAULTS.checkMs, env),
        wsPingMs: parseEnvInt('SHIP_WS_PING_MS', DEFAULTS.wsPingMs, env),
        maxRecoveries: parseEnvInt('SHIP_MAX_RECOVERIES', DEFAULTS.maxRecoveries, env),
    };
}

/**
 * @typedef {object} ShipRecoveryHooks
 * @property {() => void|Promise<void>} forceClose  Terminate half-open socket
 * @property {() => void|Promise<void>} rebuild     Tear down + new StateReceiver
 * @property {(info: object) => void|Promise<void>} giveUp  Final failure
 * @property {(msg: string, extra?: object) => void} [log]
 * @property {(msg: string, extra?: object) => void} [error]
 */

class ShipRecoveryController {
    /**
     * @param {Partial<typeof DEFAULTS> & ShipRecoveryHooks} opts
     */
    constructor(opts) {
        const {
            forceClose,
            rebuild,
            giveUp,
            log = console.log.bind(console),
            error = console.error.bind(console),
            stallMs = DEFAULTS.stallMs,
            checkMs = DEFAULTS.checkMs,
            wsPingMs = DEFAULTS.wsPingMs,
            maxRecoveries = DEFAULTS.maxRecoveries,
            now = () => Date.now(),
        } = opts;

        if (typeof forceClose !== 'function') throw new Error('forceClose required');
        if (typeof rebuild !== 'function') throw new Error('rebuild required');
        if (typeof giveUp !== 'function') throw new Error('giveUp required');

        this.forceClose = forceClose;
        this.rebuild = rebuild;
        this.giveUp = giveUp;
        this.log = log;
        this.error = error;
        this.now = now;

        this.stallMs = stallMs;
        this.checkMs = checkMs;
        this.wsPingMs = wsPingMs;
        this.maxRecoveries = maxRecoveries;

        this.lastProgressAt = this.now();
        this.lastProgressBlock = 0;
        this.recoveryAttempts = 0;
        this.recovering = false;
        this._timer = null;
        this._started = false;
    }

    /** Record that a block was applied (or stream became healthy again). */
    noteProgress(blockNum) {
        this.lastProgressAt = this.now();
        if (blockNum) {
            if (this.recoveryAttempts > 0) {
                this.log(
                    `SHiP progress restored at block ${blockNum} after ${this.recoveryAttempts} recovery attempt(s)`
                );
                this.recoveryAttempts = 0;
            }
            this.lastProgressBlock = blockNum;
        }
    }

    /** Soft touch of the idle timer without counting as recovery success. */
    armGrace() {
        this.lastProgressAt = this.now();
    }

    idleMs(now = this.now()) {
        return now - this.lastProgressAt;
    }

    isStalled(now = this.now()) {
        if (!this.stallMs || this.stallMs <= 0) return false;
        return this.idleMs(now) >= this.stallMs;
    }

    /**
     * Decide next recovery action for a stall.
     * @returns {'forceClose'|'rebuild'|'giveUp'|null}
     */
    nextAction() {
        if (this.recovering) return null;
        if (!this.isStalled()) return null;

        // Attempts so far already failed to restore progress.
        if (this.recoveryAttempts >= this.maxRecoveries) {
            return 'giveUp';
        }

        // Odd steps (1st, 3rd, …): force-close for library reconnect.
        // Even steps (2nd, 4th, …): full receiver rebuild from cursor.
        const next = this.recoveryAttempts + 1;
        return next % 2 === 1 ? 'forceClose' : 'rebuild';
    }

    /**
     * Run one recovery step if stalled. Safe to call from an interval.
     * @returns {Promise<'forceClose'|'rebuild'|'giveUp'|'skipped'|'disabled'>}
     */
    async tick() {
        if (!this.stallMs || this.stallMs <= 0) {
            return 'disabled';
        }
        if (this.recovering) {
            return 'skipped';
        }
        if (!this.isStalled()) {
            return 'skipped';
        }

        const action = this.nextAction();
        if (!action) {
            return 'skipped';
        }

        const idle = this.idleMs();
        const lastBlock = this.lastProgressBlock || 'none';

        if (action === 'giveUp') {
            this.error(
                `SHiP stall unrecovered after ${this.recoveryAttempts} attempt(s): ` +
                    `no block progress for ${Math.round(idle / 1000)}s ` +
                    `(last_block=${lastBlock}). Giving up.`
            );
            this.recovering = true;
            try {
                await this.giveUp({
                    idleMs: idle,
                    lastBlock: this.lastProgressBlock,
                    recoveryAttempts: this.recoveryAttempts,
                });
            } finally {
                this.recovering = false;
            }
            return 'giveUp';
        }

        this.recovering = true;
        this.recoveryAttempts += 1;
        try {
            if (action === 'forceClose') {
                this.error(
                    `SHiP stall detected: no block progress for ${Math.round(idle / 1000)}s ` +
                        `(last_block=${lastBlock}). Recovery #${this.recoveryAttempts}/${this.maxRecoveries}: force-close socket.`
                );
                await this.forceClose();
            } else {
                this.error(
                    `SHiP stall detected: no block progress for ${Math.round(idle / 1000)}s ` +
                        `(last_block=${lastBlock}). Recovery #${this.recoveryAttempts}/${this.maxRecoveries}: rebuild receiver from cursor.`
                );
                await this.rebuild();
            }
            // Grace period so reconnect/catch-up is not treated as another stall.
            this.armGrace();
        } catch (e) {
            this.error(
                `SHiP recovery action ${action} failed: ${e && e.message ? e.message : e}`
            );
            this.armGrace();
        } finally {
            this.recovering = false;
        }
        return action;
    }

    start() {
        if (this._started) return;
        if (!this.stallMs || this.stallMs <= 0) {
            this.log('SHiP stall recovery disabled (SHIP_STALL_MS<=0)');
            return;
        }
        this._started = true;
        this.armGrace();
        this.log(
            `SHiP stall recovery armed (stall=${this.stallMs}ms check=${this.checkMs}ms ` +
                `ping=${this.wsPingMs}ms maxRecoveries=${this.maxRecoveries})`
        );
        const interval = Math.max(1000, this.checkMs || 30_000);
        this._timer = setInterval(() => {
            this.tick().catch((e) => {
                this.error(`SHiP recovery tick error: ${e && e.message ? e.message : e}`);
            });
        }, interval);
        // Keep the timer referenced so recovery runs for the process lifetime.
        if (typeof this._timer.unref === 'function') {
            // Do not unref — we want the watchdog to stay active.
        }
    }

    stop() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        this._started = false;
    }
}

/**
 * Install application-level WS ping/pong on a live `ws` instance.
 * On missing pong, terminate the socket so the library's close/reconnect path runs.
 *
 * @param {import('ws')} ws
 * @param {{ pingMs: number, error?: Function }} opts
 * @returns {() => void} dispose
 */
function installWsHeartbeat(ws, opts) {
    const pingMs = opts && opts.pingMs;
    const error = (opts && opts.error) || console.error.bind(console);
    if (!pingMs || pingMs <= 0 || !ws) {
        return () => {};
    }
    if (ws.__oracleHeartbeatInstalled) {
        return () => {};
    }
    ws.__oracleHeartbeatInstalled = true;

    let alive = true;
    const onPong = () => {
        alive = true;
    };
    ws.on('pong', onPong);

    const iv = setInterval(() => {
        if (ws.readyState !== ws.OPEN) {
            clearInterval(iv);
            return;
        }
        if (!alive) {
            error('SHiP websocket ping timeout — terminating socket to force reconnect');
            try {
                ws.terminate();
            } catch (_) {
                /* ignore */
            }
            clearInterval(iv);
            return;
        }
        alive = false;
        try {
            ws.ping();
        } catch (_) {
            /* ignore */
        }
    }, pingMs);

    const onClose = () => {
        clearInterval(iv);
        try {
            ws.removeListener('pong', onPong);
        } catch (_) {
            /* ignore */
        }
    };
    ws.once('close', onClose);

    return () => {
        clearInterval(iv);
        try {
            ws.removeListener('pong', onPong);
            ws.removeListener('close', onClose);
        } catch (_) {
            /* ignore */
        }
    };
}

module.exports = {
    DEFAULTS,
    configFromEnv,
    ShipRecoveryController,
    installWsHeartbeat,
};
