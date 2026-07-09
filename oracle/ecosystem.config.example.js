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
            kill_timeout: 3600,
            env: {
                'CONFIG': './config'
            },
        },
        {
            // Scans teleports + receipts for missing oracle participation / stuck items
            name: "alienteleport-monitor",
            script: "./monitor-teleports.js",
            autorestart: true,
            env: {
                'CONFIG': './config',
                'INTERVAL_SEC': '300',
                'PAGES': '100',
                'MIN_AGE_SEC': '120',
                'CHAIN_ID': 'all',
            },
        },
    ]
};
