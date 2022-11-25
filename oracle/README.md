# Oracles between EOSIO and ETH chains


## Installation
1. Install all dependencies
```
yarn install
```
## Configutration
Setup a file called `config.js` like the `config-example.js`

## Compile and start eos oracle
```
yarn eos
```
Start by a spezific teleport id with --id or -n

```
yarn eos -n {number}
```
## Compile and start eth oracle

```
yarn eth
```
Start by a spezific block number --block or -b

```
yarn eth -b {number}
```
## Config file
See the ***config-example.js*** for the structure of the config file.

***endpoints*** is an array of different endpoints which are evenly used. For a higher reliability the oracle switches automatically to another endpoint if one fails. ***epVerifications*** defines the number of different endpoints which has to verify the same request. This protects the Oracle from manipulated data of hijacked endpoints in the ***endpoints*** array as long as there are less hijacked endpoints than ***epVerifications***. Set it to 1 to disable multiple verification.

On default ***config.js*** will be used. To specify another config file, use the command --config or -c 
```
yarn eos -c {path}
```
