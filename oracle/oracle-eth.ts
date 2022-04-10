#!/usr/bin/env node

/*
This oracle listens to the ethereum blockchain for `Teleport` events.

When an event is received, it will call the `received` action on the EOS chain
 */

import fs from 'fs'
import { ethers } from 'ethers'
import yargs from 'yargs'
import { ConfigType, eosio_claim_data, eosio_teleport_data } from './CommonTypes'
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig'
import { EosApi } from './eosEndpointSwitcher'
import { TransactResult } from 'eosjs/dist/eosjs-api-interfaces'

type EthDataConfig = {precision: number, symbol: string, eos:{oracleAccount: string}}

/**
 * Use this function with await to let the thread sleep for the defined amount of time
 * @param ms Milliseconds
 */
 const sleep = async (ms: number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

class EthOracle {
    public running = false
    private claimed_topic = '0xf20fc6923b8057dd0c3b606483fcaa038229bb36ebc35a0040e3eaa39cf97b17'
    private teleport_topic = '0x622824274e0937ee319b036740cd0887131781bc2032b47eac3e88a1be17f5d5'
    private DEFAULT_BLOCKS_TO_WAIT = 1 //- 5
    private blocks_file_name : string
    private eos_api: EosApi

    constructor(private config: ConfigType, private ethProvider: ethers.providers.StaticJsonRpcProvider, private signatureProvider: JsSignatureProvider){
        this.blocks_file_name = `.oracle_${configFile.eth.network}_block-${configFile.eth.oracleAccount}`
        this.eos_api = new EosApi(this.config.eos.chainId, this.config.eos.endpoints, this.signatureProvider)
    }

    /**
     * Get object of the data of an "claimed"-event on eth chain
     * @param data "claimed"-event data
     * @param config Contains information of precision and symbol of the token as well as the oracle name of this contract 
     * @returns 
     */
    static extractEthClaimedData (data: ethers.utils.Result, config: EthDataConfig): eosio_claim_data {
        console.log('data[0]',data[0])
        
        const id = data[0].toNumber() // TODO: .toBigInt()
        const to_eth = data[1].replace('0x', '') + '000000000000000000000000'
        const quantity = (data[2].toNumber() / Math.pow(10, config.precision)).toFixed(config.precision) + ' ' + config.symbol
        return { oracle_name: config.eos.oracleAccount, id, to_eth, quantity, }
    }
    
    /**
     * Get object of the data of an "teleport"-event on eth chain
     * @param data "teleport"-event data
     * @param config Contains information of precision and symbol of the token as well as the oracle name of this contract 
     * @returns 
     */
    static extractEthTeleportData(data: ethers.utils.Result, transactionHash: string, config: EthDataConfig): eosio_teleport_data {
        const tokens = data[1].toNumber();
        if (tokens <= 0) {
            throw new Error('Tokens are less than or equal to 0')
        }
        const to = data[0]
        const chain_id = data[2].toNumber();
        const amount = (tokens / Math.pow(10, config.precision)).toFixed(
            config.precision
        )
        const quantity = `${amount} ${config.symbol}`;
        const txid = transactionHash.replace(/^0x/, '');
      
        return { chain_id, confirmed: true, quantity, to, oracle_name: config.eos.oracleAccount, ref: txid };
    }

    async await_confirmation(txid: string) {
        return new Promise(async (resolve) => {
            let resolved = false;
            while (!resolved) {
                this.ethProvider.getTransactionReceipt(txid).then((receipt) => {
                    console.log(`Cofirmations ${receipt.confirmations}`) //-
                    
                    if (receipt && receipt.confirmations > this.DEFAULT_BLOCKS_TO_WAIT) {
                        console.log(`TX ${txid} has ${receipt.confirmations} confirmations`)
                        resolve(receipt);
                        resolved = true;
                    }
                })
                await sleep(10000);
            }
        })
    }

    static async save_block_to_file(block_num: number, blocks_file: string){
        fs.writeFileSync(blocks_file, block_num.toString())
    };

    /**
     * Check for "claimed" events and store them on eosio chain
     * @param from_block Block number to start looking for events
     * @param to_block Block number to end looking for events
     * @param trxBroadcast False if the transaction should not be broadcasted (not submitted to the block chain)
     */
    async process_claimed(from_block: number, to_block: number, trxBroadcast: boolean = true) {
        // Check claimed events on eth chain
        const query = {
            fromBlock: from_block,
            toBlock: to_block,
            address: this.config.eth.teleportContract,
            topics: [this.claimed_topic],
        }
        const res = await this.ethProvider.getLogs(query);
      
        // Mark each claimed event on eosio chain as claimed
        for await (const { transactionHash, data } of res) {
            // Extract data from eth claimed event
            const decodedData = ethers.utils.defaultAbiCoder.decode(['uint64', 'address', 'uint'], data);
            const eosioData = EthOracle.extractEthClaimedData(decodedData, this.config);
            console.log('claimed eosioData', eosioData);
            
            // Wait for confirmation of each transaction before continuing
            await this.await_confirmation(transactionHash);

            // Create action
            const actions = [{
                account: this.config.eos.teleportContract,
                name: 'claimed',
                authorization: [{
                    actor: this.config.eos.oracleAccount,
                    permission: this.config.eos.oraclePermission || 'active',
                }],
                data: eosioData,
            }]
        
            // Send transaction on eosio chain
            try {
                console.log(`Send claimed: ${this.config.eos.endpoints[0]}  submit: ${trxBroadcast} pk: ${this.config.eos.privateKey}`, actions); //-
                
                const eos_res = await this.eos_api.getAPI().transact({ 
                      actions 
                  }, { 
                      blocksBehind: 3, 
                      expireSeconds: 30, 
                      broadcast: trxBroadcast 
                }) as TransactResult
          
                console.log(`Sent notification of claim with txid ${eos_res.transaction_id}, for ID ${eosioData.id
                }, account 0x${eosioData.to_eth.substring(0, 40)}, quantity ${eosioData.quantity}`)
          
                console.log('Claimed result', eos_res); //-
          
            } catch (e: any) {
                // Check if the error appears because the transaction is already claimed
                if (e.message.indexOf('Already marked as claimed') > -1) {
                    console.log(`ID ${eosioData.id} is already claimed, account 0x${eosioData.to_eth.substring(0, 40)}, quantity ${eosioData.quantity} ✔️`)
                } else {
                    console.error(`Error sending confirm ${e.message} ❌`)
                }
            }
        }
    }

    /**
     * Check for "teleport" events and store them on eosio chain
     * @param from_block Block number to start looking for events
     * @param to_block Block number to end looking for events
     * @param trxBroadcast False if the transaction should not be broadcasted (not submitted to the block chain)
     */
    async process_teleported(from_block: number, to_block: number, trxBroadcast: boolean = true){
        // Check teleport events on eth chain
        const query = {
          fromBlock: from_block,
          toBlock: to_block,
          address: this.config.eth.teleportContract,
          topics: [this.teleport_topic],
        }
        const res = await this.ethProvider.getLogs(query)
      
        // Confirm each teleport event on eosio chain
        for await (const { transactionHash, data } of res) {
            // Extract data from teleport eth event
            const decodedData = ethers.utils.defaultAbiCoder.decode(['string', 'uint', 'uint'], data)
            const eosioData = EthOracle.extractEthTeleportData(decodedData, transactionHash, this.config)
        
            // Wait for confirmation of each transaction before continuing
            await this.await_confirmation(transactionHash);
            const actions = [{
                account: this.config.eos.teleportContract,
                name: 'received',
                authorization: [{
                  actor: this.config.eos.oracleAccount,
                  permission: this.config.eos.oraclePermission || 'active',
                }],
                data: eosioData,
            }]
        
            // Send transaction on eosio chain
            try {
                const eos_res = await this.eos_api.getAPI().transact({ 
                      actions 
                  }, { 
                      blocksBehind: 3, 
                      expireSeconds: 30, 
                      broadcast: trxBroadcast 
                }) as TransactResult
          
                console.log(`Sent notification of teleport with txid ${eos_res.transaction_id}`);
            } catch (e: any) {
                if (e.message.indexOf('Oracle has already approved') > -1) {
                  console.log('Oracle has already approved ✔️')
                } else {
                    console.error(`Error sending teleport ${e.message} ❌`)
                }
            }
            await sleep(500);
        }
    }

    /**
     * Loads a block number from a saved file if one exists or throws an error.
     * @returns a saved block number from a file
     */
    static async load_block_number_from_file(blocks_file: string) {
        //   let block_number: string | number = 'latest';
        if (!fs.existsSync(blocks_file))
            throw new Error('block file does not exist.')

        const file_contents = fs.readFileSync(blocks_file).toString()
        if (!file_contents) throw new Error('No blocks file')

        const block_number = parseInt(file_contents)
        if (isNaN(block_number)) throw new Error('No block number in file.')

        return block_number;
    }

    /**
     * Run the process of checking the eth chain for teleports and claims and store the state on ethe eosio chain
     * @param start_ref Block number to start from. String 'latest' to start from the latest block in block number file
     * @param trxBroadcast False if transactions should not be broadcasted (not submitted to the block chain)
     */
    async run(start_ref: 'latest' | number, trxBroadcast: boolean = true){
      let from_block: number | undefined;
      this.running = true
      try{
          while (this.running) {
              try {
                const block = await this.ethProvider.getBlock('latest');
                const latest_block = block.number;

                if (!from_block) {
                  if (start_ref === 'latest') {
                    try {
                        from_block = await EthOracle.load_block_number_from_file(this.blocks_file_name);
                        from_block -= 50;                   // for fresh start go back 50 blocks
                        console.log(`Starting from saved block with additional previous 50 blocks for safety: ${from_block}.`);
                    } catch (err) {
                        console.log('Could not get block from file and it was not specified ❌');
                        from_block = latest_block - 100     // go back 100 blocks from latest
                    }
                  } else if (typeof start_ref === 'number') {
                      from_block = start_ref;
                  } else {
                      from_block = this.config.eth.genesisBlock;
                  }
                }
                if(from_block < 0){
                    from_block = 0
                }

                let to_block = Math.min(from_block + 100, latest_block)

                if (start_ref >= latest_block) {
                    console.log(`Up to date at block ${to_block}`)
                    await sleep(10000);
                }
                console.log(`Getting events from block ${from_block} to ${to_block}`)

                await this.process_claimed(from_block, to_block, trxBroadcast)
                await this.process_teleported(from_block, to_block, trxBroadcast)

                from_block = to_block;

                // Save last block received
                await EthOracle.save_block_to_file(to_block, this.blocks_file_name)

                if (latest_block - from_block <= 1000) {
                    console.log('Waiting...');
                    await sleep(30000);
                } else {
                    console.log(`Not waiting... ${latest_block} - ${from_block}`)
                }
              } catch (e: any) {
                  console.error('⚡️ ' + e.message)

                  console.error('Try again in 5 seconds')
                  await sleep(5000)
              }
          }
      } catch (e){
        console.error('⚡️ ' + e);
    }
        console.log('Thread closed 💀')
    }
}

// Handle params from console
const argv = yargs
    .version().alias('version', 'v')
    // .option('id', {
    //     alias: 'n',
    //     description: 'Teleport id to start from',
    //     type: 'number'
    // })
    // .option('amount', {
    //     alias: 'a',
    //     description: 'Amount of handled teleports per requests',
    //     type: 'number'
    // })
    .option('block', {
        alias: 'b',
        description: 'Block number to start scanning from',
        type: 'number'
    })
    // .option('signs', {
    //     alias: 's',
    //     description: 'Amount of signatures until this oracle will sign too',
    //     type: 'number'
    // })
    .option('config', {
        alias: 'c',
        description: 'Path of config file',
        type: 'string'
    })
    .option('broadcast', {
      alias: 'o',
      type: 'boolean',
      description: 'boolean to determine if transactions should be submitted to blockchain',
      default: true,
    })
    .help().alias('help', 'h').argv as {
        // id: number,
        block: number,
        // signs: number,
        config: string,
        broadcast: boolean,
    };

// Load config and set title
const config_path = argv.config || process.env['CONFIG'] || './config'
process.title = `oracle-eth ${config_path}`
const configFile : ConfigType = require(config_path)

// Check and set start parameters
let startRef: 'latest' | number = 'latest'
if(argv.block) {
    startRef = argv.block;
} else if(process.env['START_BLOCK']) {
    const start_block_env = parseInt(process.env['START_BLOCK'])
    if(isNaN(start_block_env)) {
        console.error(`You must supply start block as an integer in env`)
        process.exit(1);
    }
    startRef = start_block_env;
}
if(configFile.eos.epVerifications > configFile.eos.endpoints.length){
    console.error('Error: epVerifications cannot be greater than given amount of endpints')
    process.exit(1)
}
const eosSigProvider = new JsSignatureProvider([configFile.eos.privateKey])
const ethProvider = new ethers.providers.StaticJsonRpcProvider(configFile.eth.endpoint)

// Set up the oracle
const ethOracle = new EthOracle(configFile, ethProvider, eosSigProvider)

// Run the process
ethOracle.run(startRef, argv.broadcast)