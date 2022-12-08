module.exports = {
    precision: 4, // This should not be changed for any chain
    symbol: 'TLM', // This should not be changed for any chain
    network: 'BSC', // This will be set for a BSC configured oracle
    // network: 'ETH', // This will be set for a ETH configured oracle
    eos: {
        chainId: "f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12", // Fixed wot be the Wax chainId
        wsEndpoint: 'ws://<shipnode-endpoint>', // Should be changed to suit the oracle
        endpoint: 'https://eosio.api.endpoint', // Should be changed to suit the oracle
        teleportContract: 'other.worlds',
        oracleAccount: '', // oracle Wax account that will used by the oracle to call sign and received actions on other.worlds
        privateKey: '5C234dc...' // Should be changed to suit the oracle to be key for the oracleAccount
    },
    eth: {
        teleportContract: '0x2222227E22102Fe3322098e4CBfE18cFebD57c95', // This is the teleport contract address for BSC
        // teleportContract: '0x888888848B652B3E3a0f34c96E00EEC0F3a23F72', // This is the teleport contract address for ETH
        wsEndpoint: 'wss://<oracle-specific>', // Should be changed to suit the oracle
        endpoint: 'https://<oracle-specific>', // Should be changed to suit the oracle
        oracleAccount: '0x111111111111111111111111111111111111111', // Should be changed to suit the oracle
        privateKey: 'ABC434DCF...' // Should be changed to suit the oracle to match th oracle account used on the EVM chain.
    }
}
