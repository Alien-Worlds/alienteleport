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
    ]
};
