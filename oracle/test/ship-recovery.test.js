'use strict';

/**
 * Lightweight tests for SHiP recovery policy (no SHiP/network).
 * Run: node test/ship-recovery.test.js
 */

const assert = require('assert');
const {
    ShipRecoveryController,
    configFromEnv,
} = require('../lib/ship-recovery');

function test(name, fn) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (e) {
        console.error(`  FAIL ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ok  ${name}`);
    } catch (e) {
        console.error(`  FAIL ${name}`);
        console.error(e);
        process.exitCode = 1;
    }
}

console.log('ship-recovery');

test('configFromEnv defaults', () => {
    const c = configFromEnv({});
    assert.strictEqual(c.stallMs, 120000);
    assert.strictEqual(c.maxRecoveries, 4);
});

test('configFromEnv overrides', () => {
    const c = configFromEnv({
        SHIP_STALL_MS: '5000',
        SHIP_MAX_RECOVERIES: '2',
        SHIP_WS_PING_MS: '0',
    });
    assert.strictEqual(c.stallMs, 5000);
    assert.strictEqual(c.maxRecoveries, 2);
    assert.strictEqual(c.wsPingMs, 0);
});

(async () => {
    await testAsync('ladder: forceClose → rebuild → forceClose → rebuild → giveUp', async () => {
        const actions = [];
        let now = 1_000_000;
        const ctl = new ShipRecoveryController({
            stallMs: 1000,
            checkMs: 100,
            maxRecoveries: 4,
            now: () => now,
            log: () => {},
            error: () => {},
            forceClose: async () => {
                actions.push('forceClose');
            },
            rebuild: async () => {
                actions.push('rebuild');
            },
            giveUp: async () => {
                actions.push('giveUp');
            },
        });

        // Not stalled yet
        assert.strictEqual(await ctl.tick(), 'skipped');

        now += 2000; // stall
        assert.strictEqual(await ctl.tick(), 'forceClose');
        assert.strictEqual(ctl.recoveryAttempts, 1);

        // Grace was armed; not stalled until another stall window
        assert.strictEqual(await ctl.tick(), 'skipped');
        now += 2000;
        assert.strictEqual(await ctl.tick(), 'rebuild');
        assert.strictEqual(ctl.recoveryAttempts, 2);

        now += 2000;
        assert.strictEqual(await ctl.tick(), 'forceClose');
        now += 2000;
        assert.strictEqual(await ctl.tick(), 'rebuild');
        assert.strictEqual(ctl.recoveryAttempts, 4);

        now += 2000;
        assert.strictEqual(await ctl.tick(), 'giveUp');
        assert.deepStrictEqual(actions, [
            'forceClose',
            'rebuild',
            'forceClose',
            'rebuild',
            'giveUp',
        ]);
    });

    await testAsync('progress after recovery resets attempt counter', async () => {
        let now = 0;
        const actions = [];
        const ctl = new ShipRecoveryController({
            stallMs: 100,
            maxRecoveries: 4,
            now: () => now,
            log: () => {},
            error: () => {},
            forceClose: async () => actions.push('forceClose'),
            rebuild: async () => actions.push('rebuild'),
            giveUp: async () => actions.push('giveUp'),
        });

        now = 1000;
        assert.strictEqual(await ctl.tick(), 'forceClose');
        assert.strictEqual(ctl.recoveryAttempts, 1);

        // Stream recovers
        now = 1100;
        ctl.noteProgress(42);
        assert.strictEqual(ctl.recoveryAttempts, 0);

        // Stall again → starts over at forceClose
        now = 2000;
        assert.strictEqual(await ctl.tick(), 'forceClose');
        assert.deepStrictEqual(actions, ['forceClose', 'forceClose']);
    });

    await testAsync('disabled when stallMs<=0', async () => {
        const ctl = new ShipRecoveryController({
            stallMs: 0,
            forceClose: async () => {
                throw new Error('should not run');
            },
            rebuild: async () => {
                throw new Error('should not run');
            },
            giveUp: async () => {
                throw new Error('should not run');
            },
            log: () => {},
            error: () => {},
        });
        assert.strictEqual(await ctl.tick(), 'disabled');
    });

    await testAsync('concurrent tick is skipped while recovering', async () => {
        let now = 0;
        let release;
        const gate = new Promise((r) => {
            release = r;
        });
        const ctl = new ShipRecoveryController({
            stallMs: 10,
            now: () => now,
            log: () => {},
            error: () => {},
            forceClose: async () => {
                await gate;
            },
            rebuild: async () => {},
            giveUp: async () => {},
        });
        now = 100;
        const p = ctl.tick();
        assert.strictEqual(await ctl.tick(), 'skipped');
        release();
        assert.strictEqual(await p, 'forceClose');
    });

    if (process.exitCode) {
        console.error('some tests failed');
        process.exit(process.exitCode);
    }
    console.log('all tests passed');
})();
