module.exports = {
    apps: [
        {
            name: "alienteleport-eth",
            script: "./oracle-eth.js",
            node_args: ["--max-old-space-size=8192"],
            autorestart: true,
            kill_timeout: 3600,
            env: {
                'CONFIG': './config'
            },
        },
        {
            name: "alienteleport-eos",
            script: "./oracle-eos.js",
            node_args: ["--max-old-space-size=8192"],
            autorestart: true,
            // Last-resort process.exit(2) after SHiP recovery is exhausted
            kill_timeout: 10000,
            env: {
                'CONFIG': './config',
                // No SHiP block progress for this long → recovery ladder
                // (force-close → rebuild → … → exit 2). 0 disables.
                'SHIP_STALL_MS': '120000',
                'SHIP_STALL_CHECK_MS': '30000',
                // Application-level WS ping; terminate socket if no pong (0 = disable)
                'SHIP_WS_PING_MS': '30000',
                // Max recovery attempts before process.exit(2) for PM2
                'SHIP_MAX_RECOVERIES': '4',
            },
        },
        {
            // Scans teleports + receipts for missing oracle participation / stuck items.
            // Read-only status: http://<host>:9090/  and  /api/status  /health
            name: "alienteleport-monitor",
            script: "./monitor-teleports.js",
            autorestart: true,
            env: {
                'CONFIG': './config',
                'INTERVAL_SEC': '300',
                'PAGES': '100',
                'MIN_AGE_SEC': '120',
                'CHAIN_ID': 'all',
                'STATUS_PORT': '9090',
                'STATUS_BIND': '0.0.0.0',
            },
        },
    ]
};
