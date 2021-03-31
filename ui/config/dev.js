module.exports = {
    waxEndpoint: 'https://wax.eosdac.io',
    waxChainId: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4',
    tlmContract: 'alien.worlds',
    teleportContract: 'other.worlds',
    ipfsRoot: 'https://ipfs.io/ipfs/',
    networks: {
        '1': {
            name: 'Ethereum',
            tlmContract: '0x888888848b652b3e3a0f34c96e00eec0f3a23f72',
            destinationChainId: 1,
            className: 'ethereum'
        },
        '3': {
            name: 'Ropsten Testnet',
            tlmContract: '0x79C3EAb51c9b689766496ddb0bD187ccAec2b021',
            destinationChainId: 1,
            className: 'ethereum'
        },
        '56': {
            name: 'BSC',
            tlmContract: '0x2222227E22102Fe3322098e4CBfE18cFebD57c95',
            destinationChainId: 2,
            className: 'binance'
        }
    }
}
