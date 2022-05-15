# Alien Teleport

Contracts and tools to create a bridge between WAX tokens and an ERC-20 counterpart.

## Contracts

There are contracts available for both EOSIO chains and Ethereum, both should be deployed 
on their respective chains.

## Process

Transferring from EOSIO -> ETH requires depositing the tokens to the EOSIO contract with a standard transfer (no memo required), 
then teleporting the tokens using the `teleport` action.

Transferring from ETH -> EOSIO simply requires callint the `teleport` function on the Ethereum contract.

You can use the SavAct WebApp as frontend by entering your EOSIO contract and network. For direct selection add your settings to the URL 
[https://savact.app/#/_trx_/teleport?bridge=**other.worlds**&eosio=**WAX**&eth=**BSC**](https://savact.app/#/_trx_/teleport?bridge=other.worlds&eosio=WAX&eth=BSC)

The App is only compatible with the EOSIO teleport contract of version 1 and higher. For more information see its [README.md](./contract/README.md)

To add your teleport in a select box of the SavAct WebApp, feel free to request the admins of https://t.me/SavActGroup

## Oracles

Oracle accounts must be registered using the `regoracle` (EOSIO) or `regOracle` (Ethereum) functions.

Oracles can then call the received function on each contract when they see a transaction on the opposing chain.

### Setup and running

1. Copy config-example.js to config.js
2. Change the configuration settings to match your tokens
3. Start the oracle using the following command `CONFIG=./[path/to/config] oracle-eos|eth.js`