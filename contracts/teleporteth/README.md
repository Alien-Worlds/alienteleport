# ETH Contract for Alien Teleport

## Testing the eth contract

### Installation
1. Install all dependencies
```
yarn install
```

### Configutration
Use truffle-config.js file to change your test net settings. The current settings need a mnemonic key phrase stored in a file called "`.secret`".

### Run eth contract tests
1. Start two consoles
2. Use one to run an eth test chain
```
ganache-cli
```
3. Use the other to start the tests
```
truffle test
```