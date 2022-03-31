module.exports = {
    precision: 4,
    symbol: 'TLM',
    confirmations: 2,
    eos: {
        network: 'EOS',
        chainId: "cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f",
        endpoints: [
            'https://jungle.eosphere.io:443', 'http://jungle2.cryptolions.io:80', 'http://jungle2.cryptolions.io:8888', 
        ],
        epVerifications: 2,
        teleportContract: 'eosiotestacc',
        oracleAccount: 'anneliese',
        privateKey: '5K29JmEvWEnfdD5DV1bm9Ro4qMrTKhBGmTXuaaqmrZSMEntqqZQ'
        
    },
    eth: {
        network: 'BSC',
        endpoint: 'http://localhost:8545/',
        teleportContract: '0x0789a30aa30d6a7a7536a7ed26956bbdb0fc80bd',
        oracleAccount: '0x111111111111111111111111111111111111111',
        privateKey: '2a6bdd74caefd68f16f7ee06ad37c922502c9b081f2fa26a69a1c57cd0c118a2'
    }
}
