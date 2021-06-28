module.exports = {
    precision: 4,
    symbol: 'TLM',
    network: 'BSC',
    eos: {
        wsEndpoint: 'ws://178.63.44.179:8082',
        chainId: "f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12",
        endpoint: 'https://testnet.waxsweden.org',
        teleportContract: 'other.worlds',
        oracleAccount: '',
        privateKey: '5C234dc...'
    },
    eth: {
        wsEndpoint: 'wss://kovan.infura.io/ws/v3/9ae811d1c04243f2869a05848207b985',
        endpoint: 'https://ropsten.infura.io/v3/9ae811d1c04243f2869a05848207b985',
        teleportContract: '0x0789a30aa30d6a7a7536a7ed26956bbdb0fc80bd',
        oracleAccount: '0x111111111111111111111111111111111111111',
        privateKey: 'ABC434DCF...'
    }
}
