module.exports = {
    precision: 4,       // Token precision
    symbol: 'TLM',      // Token symbol
    confirmations: 3,   // Number of needed oracle confirmations per teleport
    eos: {
        network: 'EOS', // Abbreviation of the chain
        id: 0,          // Id of this chain for this bridge
        netId: "e70aaab8997e1dfce58fbfac80cbbb8fecec7b99cf982a9444273cbc64c41473", // EOSIO identification for different chains
        endpoints: [
            'https://jungle.eosphere.io:443', 
            'http://jungle2.cryptolions.io:80', 
            'http://jungle2.cryptolions.io:8888',
        ],
        epVerifications: 2,                 // Verify data by this number of endpoints
        teleportContract: 'alein.worlds',   // EOSIO token contract account
        oracleAccount: 'oracle1',           // EOSIO oracle account
        privateKey: '5K29JmEvWEnfdD5DV1bm9Ro4qMrTKhBGmTXuaaqmrZSMEntqqZQ', // Example private EOSIO key. Do not use it. It is public!
        waitCycle: 165,                     // Seconds to wait to check for new teleports after all teleports are handled. EOSIO chains typically needs 165 seconds to set transactions as irreversible.
    },
    eth: {
        network: 'BSC', // Abbreviation of the chain
        id: 2,          // Id of this chain for this bridge. Let it undefined to store the EOSIO recipient chain id on the recipient chain like the old way
        netId: '97',    // Id of this chain defined on chailist.org 
        endpoints: [
            'https://data-seed-prebsc-1-s1.binance.org:8545', 
            'https://data-seed-prebsc-2-s2.binance.org:8545', 
            'https://data-seed-prebsc-1-s2.binance.org:8545',
        ],
        genesisBlock: 19024616, // Initial block to start from
        epVerifications: 2,     // Verify data by this number of endpoints
        teleportContract: '0x281D131268f5D257297DDDe4B4047EeF881db79d', // ETH teleport contract address
        oracleAccount: '0x8353C7d4758D113Dd4407AC4b1115fF2E54D9eA0',    // ETH oracle address
        privateKey: '8940fbd7806ec09af7e1ceaf7ccac80e89eeeb1e85cee42f84c07b1d5a378100', // Example private ETH key. Do not use it. It is public!
        waitCycle: 10,          // Seconds to wait to check for new teleports after all teleports are handled
        blocksToWait: 6,        // Amount of blocks to wait until it will be considered as irreversible. Lowest accepted value is 5
    }
}
