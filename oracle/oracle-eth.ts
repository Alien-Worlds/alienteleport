#!/usr/bin/env node

/*
This oracle listens to the ethereum blockchain for `Teleport` events.

When an event is received, it will call the `received` action on the EOS chain
 */

import fs from 'fs'
import { ethers } from 'ethers'
import yargs, { number } from 'yargs'
import { ConfigType, eosio_claim_data, eosio_teleport_data } from './CommonTypes'
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig'
import { EosApi, EthApi } from './EndpointSwitcher'
import { TransactResult } from 'eosjs/dist/eosjs-api-interfaces'

type EthDataConfig = {precision: number, symbol: string, eos:{oracleAccount: string}}

/**
 * Use this function with await to let the thread sleep for the defined amount of time
 * @param ms Milliseconds
 */
 const sleep = async (ms: number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

class EthOracle {
    public running = false
    private claimed_topic = '0xf20fc6923b8057dd0c3b606483fcaa038229bb36ebc35a0040e3eaa39cf97b17'
    private teleport_topic = '0x622824274e0937ee319b036740cd0887131781bc2032b47eac3e88a1be17f5d5'
    static MIN_BLOCKS_TO_WAIT = 5
    private blocksToWait : number
    private blocks_file_name : string
    private eos_api: EosApi
    private eth_api: EthApi
    private minTrySend = 3

    constructor(private config: ConfigType, private signatureProvider: JsSignatureProvider){
        this.blocksToWait = typeof config.eth.blocksToWait == 'number' && config.eth.blocksToWait > EthOracle.MIN_BLOCKS_TO_WAIT? config.eth.blocksToWait : EthOracle.MIN_BLOCKS_TO_WAIT
        this.blocks_file_name = `.oracle_${configFile.eth.network}_block-${configFile.eth.oracleAccount}`
        this.eos_api = new EosApi(this.config.eos.netId, this.config.eos.endpoints, this.signatureProvider)
        this.eth_api = new EthApi(this.config.eth.netId, this.config.eth.endpoints)
        this.minTrySend = Math.max(this.minTrySend, config.eos.endpoints.length)
    }

    /**
     * Get object of the data of an "claimed"-event on eth chain
     * @param data "claimed"-event data
     * @param config Contains information of precision and symbol of the token as well as the oracle name of this contract 
     * @returns 
     */
    static extractEthClaimedData (data: ethers.utils.Result, config: EthDataConfig): eosio_claim_data {
        const id = data[0].toNumber()
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
        const tokens = data[1].toNumber() as number
        if (tokens <= 0) {
            throw new Error('Tokens are less than or equal to 0')
        }
        const to = data[0]
        const chain_id = data[2].toNumber() as number
        const amount = (tokens / Math.pow(10, config.precision)).toFixed(
            config.precision
        )
        const quantity = `${amount} ${config.symbol}`
        const txid = transactionHash.replace(/^0x/, '')
      
        return { chain_id, confirmed: true, quantity, to, oracle_name: config.eos.oracleAccount, ref: txid }
    }

    /**
     * Wait until an event got enough confirmations and validations by other endpoints
     * @param entry.transactionHash Hash of the transaction which contains the event
     * @param entry.data Event data in raw format
     * @returns False if there are not enough endpoints which validate the event
     */
    async await_confirmation(entry:{ transactionHash: string, data: string}) {
        let validators = new Set()
        if(this.eth_api.get_EndpointAmount() < this.config.eth.epVerifications){
            throw Error('Not enough eth endpoints for validation ❌')
        }

        let firstEp = undefined
        while (true) {
            try{
                const receipt = await this.eth_api.getProvider().getTransactionReceipt(entry.transactionHash)
                
                if(receipt){
                    // CHeck amount of block confirmations
                    const overConfs = receipt.confirmations - this.blocksToWait
                    if (overConfs > 0) {
                        let ep = this.eth_api.getEndpoint()
                        validators.add(ep)
                        
                        if(receipt.logs.find(e=>{ return e.data == entry.data}) == undefined){
                            console.log(`Event data of ${entry.transactionHash} was not found by ${ep} ❌`)
                            return false
                        }

                        console.log(`Cofirmations ${receipt.confirmations} by ${ep}`)
    
                        if(validators.size >= this.config.eth.epVerifications){
                            console.log(`TX ${entry.transactionHash} has ${receipt.confirmations} confirmations`)
                            return true
                        }
    
                        // If one endpoint reaches one more confirmations as needed, check each endpoint again and thow an error if they still not confirm   
                        if(overConfs > 1){
                            if(firstEp == undefined){
                                firstEp = ep
                            } else if(firstEp == ep){
                                console.error(`Verification failed, only ${validators.size} eth endpoints verified the transaction ${entry.transactionHash} ❌`);
                                return false
                            }
                            // Do not sleep to check all other endpoints after reaching one more confirmation than needed
                        } else {
                            // Sleep one second to check other endpoints if the confirmation amount is just reached
                            await sleep(1000)
                        }
                    }
                } else {
                    await sleep(10000)
                }
            } catch (e) {
                console.error('Error on get transaction receipt', e);
                await sleep(1000)
            }
            await this.eth_api.nextEndpoint()
        }
    }

    static async save_block_to_file(block_num: number, blocks_file: string){
        fs.writeFileSync(blocks_file, block_num.toString())
    }

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
        const res = await this.eth_api.getProvider().getLogs(query)

        // Mark each claimed event on eosio chain as claimed
        for await (const entry of res) {
            // Extract data from eth claimed event
            const decodedData = ethers.utils.defaultAbiCoder.decode(['uint64', 'address', 'uint'], entry.data)
            const eosioData = EthOracle.extractEthClaimedData(decodedData, this.config)

            // Wait for confirmation of each transaction before continuing
            if(!await this.await_confirmation(entry)){
                console.log(`Skip claimed event with ${eosioData.to_eth} as recipient and the id ${eosioData.id}`)
                continue
            }

            // Continue this event if it was marked as removed
            if(entry.removed){
                console.log(`Claimed event with trx hash ${entry.transactionHash} got removed and will be skipped ❌`)
                continue
            }

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
            const eos_res = await this.sendTransaction(actions, trxBroadcast)
            if(eos_res === false){
                console.log(`Skip sending claimed of id ${eosioData.id} to the eosio chain ❌`)
            } else if(eos_res === true){
                console.log(`Id ${eosioData.id} is already claimed, account 0x${eosioData.to_eth.substring(0, 40)}, quantity ${eosioData.quantity} ✔️`)
            } else {
                console.log(`Send claimed of id ${eosioData.id}, account 0x${eosioData.to_eth.substring(0, 40)}, quantity ${eosioData.quantity
                }. EOSIO blocknumber ${eos_res.processed.block_num} and trx id ${eos_res.transaction_id} ✔️`);
            }
        }
    }

    /**
     * Send transaction to EOSIO chain
     * @param actions EOSIO transaction actions
     * @param trxBroadcast Boolean to broadcast a transaction
     * @returns False if it fails, true if a transaction was already marked as claimed or the object of the transaction result
     */
    async sendTransaction(actions: any, trxBroadcast: boolean = true){
        for(let tries = 0; tries < this.minTrySend; tries++){
            try {
                const eos_res = await this.eos_api.getAPI().transact({ actions }, { 
                    blocksBehind: 3, 
                    expireSeconds: 30, 
                    broadcast: trxBroadcast 
                }) as TransactResult                
                return eos_res
            } catch (e: any) {
                let error : string = 'Unkwon error'
                if(e.message){
                    // Get error message
                    const s = e.message.indexOf(':') + 1
                    if(s > 0 && s < e.message.length){
                        error = e.message.substring(s)
                        console.log();
                    } else {
                        error = e.message
                    }
                    // Check if the error appears because the transaction is already claimed or approved
                    if (error.indexOf('Already marked as claimed') > -1 || error.indexOf('Oracle has already approved') > -1 || error.indexOf('This teleport has already completed') > -1) {
                        return true
                    }
                }
                
                console.error(`Error while sending to eosio chain with ${this.eos_api.getEndpoint()}: ${error} ❌`)
                await this.eos_api.nextEndpoint()
                await sleep(1000)
            }
        }
        return false
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
        const res = await this.eth_api.getProvider().getLogs(query)
      
        // Confirm each teleport event on eosio chain
        for await (const entry of res) {
            // Extract data from teleport eth event
            const decodedData = ethers.utils.defaultAbiCoder.decode(['string', 'uint', 'uint'], entry.data)
            const eosioData = EthOracle.extractEthTeleportData(decodedData, entry.transactionHash, this.config)
          
            // Check id is equal to recipient chain
            if(this.config.eos.id !== undefined && eosioData.chain_id !== Number(this.config.eos.id)){
                console.log(`Skip teleport event with ${eosioData.to} as recipient and ref of ${eosioData.ref} because the chain id ${eosioData.chain_id} referes to another blockchain.`)
                continue
            }

            // Wait for confirmation of each transaction before continuing
            if(!await this.await_confirmation(entry)){
                console.log(`Skip teleport event with ${eosioData.to} as recipient and ref of ${eosioData.ref}`)
                continue
            }

            // Continue this event if it was marked as removed
            if(entry.removed){
                console.log(`Teleport with trx hash ${entry.transactionHash} got removed and will be skipped ❌`)
                continue
            }

            // Set the id as the id of the sender chain
            if(this.config.eth.id !== undefined){
                eosioData.chain_id = Number(this.config.eth.id)
            }

            // Create action
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
            const eos_res = await this.sendTransaction(actions, trxBroadcast)
            if(eos_res === false){
                console.log(`Skip sending teleport to ${eosioData.to} with ref ${eosioData.ref} and quantity of ${eosioData.quantity} ❌`)
            } else if(eos_res === true){
                console.log(`Oracle has already approved teleport to ${eosioData.to} with ref ${eosioData.ref} and quantity of ${eosioData.quantity} ✔️`)
            } else {
                console.log(`Send teleport to ${eosioData.to} with ref ${eosioData.ref} and quantity of ${eosioData.quantity
                }. EOSIO blocknumber ${eos_res.processed.block_num} and trx id ${eos_res.transaction_id} ✔️`);
            }
        }
    }

    /**
     * Loads a block number from a saved file if one exists or throws an error.
     * @returns a saved block number from a file
     */
    static async load_block_number_from_file(blocks_file: string) {
        //   let block_number: string | number = 'latest'
        if (!fs.existsSync(blocks_file))
            throw new Error('block file does not exist.')

        const file_contents = fs.readFileSync(blocks_file).toString()
        if (!file_contents) throw new Error('No blocks file')

        const block_number = parseInt(file_contents)
        if (isNaN(block_number)) throw new Error('No block number in file.')

        return block_number
    }

    /**
     * Get latest block of eth blockchain
     * @returns latest block number
     */
    private async getLatestBlock() {
       let tries = 0
       while(true) {
           try{
               const block = await this.eth_api.getProvider().getBlock('latest')
               return block.number
           } catch(e){
               if(tries >= this.eth_api.get_EndpointAmount()){
                   console.log('Could not get latest block by any eth endpoint ❌')
                   return undefined
               } else {
                   console.error(`Could not get latest block with ${this.eth_api.getEndpoint()} ❌`)
                   await this.eth_api.nextEndpoint()
                   console.log(`Try ${this.eth_api.getEndpoint()} in a second...`)
                   tries++                   
                   await sleep(1000)
               }
           }
       }
    }

    /**
     * Run the process of checking the eth chain for teleports and claims and store the state on ethe eosio chain
     * @param start_ref Block number to start from. String 'latest' to start from the latest block in block number file
     * @param trxBroadcast False if transactions should not be broadcasted (not submitted to the block chain)
     */
    async run(start_ref: 'latest' | number, trxBroadcast: boolean = true, waitCycle = 30){
        let from_block: number | undefined
        this.running = true
        try{
            await this.eth_api.nextEndpoint()
            await this.eos_api.nextEndpoint()
        
            while (this.running) {
                try {
                    // Get latest block from chain
                    const latest_block = await this.getLatestBlock()
                    if(typeof latest_block != 'number'){
                        console.error('Latest block number is not a number', latest_block)
                        return
                    }

                    // Get block number to start from on this cycle
                    if (!from_block) {
                        if (start_ref === 'latest') {
                            try {
                                from_block = await EthOracle.load_block_number_from_file(this.blocks_file_name)
                                from_block -= 50                     // for fresh start go back 50 blocks
                                if(this.config.eth.genesisBlock && this.config.eth.genesisBlock > from_block){
                                    from_block = this.config.eth.genesisBlock
                                    console.log('Start by genesis block.')
                                } else {
                                    console.log(`Starting from saved block with additional previous 50 blocks for safety: ${from_block}.`)
                                }
                            } catch (err) {
                                console.log('Could not get block from file and it was not specified ❌')
                                if(this.config.eth.genesisBlock){
                                    from_block = this.config.eth.genesisBlock
                                    console.log('Start by genesis block.')
                                } else {
                                    from_block = latest_block - 100     // go back 100 blocks from latest
                                    console.log('Start 100 blocks before the latest block.')
                                }
                            }
                        } else if (typeof start_ref === 'number') {
                                from_block = start_ref
                        } else {
                            from_block = this.config.eth.genesisBlock
                        }
                    }
                    if(from_block < 0){
                        from_block = 0
                    }

                    // Get the last block number until teleports should be checked on this cycle
                    let to_block = Math.min(from_block + 100, latest_block)

                    if (from_block <= to_block) {
                        console.log(`Getting events from block ${from_block} to ${to_block}`)
                        await this.process_claimed(from_block, to_block, trxBroadcast)
                        await this.process_teleported(from_block, to_block, trxBroadcast)
                        from_block = to_block                                               // In next round the current to block is the from block
                        await EthOracle.save_block_to_file(to_block, this.blocks_file_name) // Save last block received
                    } else {
                        console.log(`⚡️ From block ${from_block} is higher than to block ${to_block}`)
                        await sleep(10000)
                    }
                    if (latest_block - from_block <= 1000) {
                        await EthOracle.WaitWithAnimation(waitCycle, 'Wait for new blocks...')
                    } else {
                        console.log(`Latest block is ${latest_block}. Not waiting...`)
                    }
                } catch (e: any) {
                    console.error('⚡️ ' + e.message)

                    console.error('Try again in 5 seconds')
                    await sleep(5000)
                }

                // Select the next endpoint to distribute the requests
                await this.eos_api.nextEndpoint()
            }
        } catch(e){
            console.error('⚡️ ' + e)
        }
        console.log('Thread closed 💀');
    }

    /**
     * Wait for a defined amount of time and show remaining seconds
     * @param s Seconds to wait
     */
    static async WaitWithAnimation(s: number, info: string = ''){
        process.stdout.write(info + "\n\x1b[?25l")
        for(let i = 0; i < s; i++){
            process.stdout.write(`💤 ${i} s / ${s} s 💤`)
            await sleep(1000)
            process.stdout.write("\r\x1b[K")
        }
        
        process.stdout.moveCursor(0, -1) // up one line
        process.stdout.clearLine(1) // from cursor to end
    }
}

// Handle params from console
const argv = yargs
    .version().alias('version', 'v')
    .option('block', {
        alias: 'b',
        description: 'Block number to start scanning from',
    })
    .option('waiter', {
        alias: 'w',
        description: 'Seconds to wait after finishing all current teleports',
        type: 'number'
    })
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
        block: number,
        waiter: number,
        config: string,
        broadcast: boolean,
    }
    
// Load config and set title
const config_path = argv.config || process.env['CONFIG'] || './config'
process.title = `oracle-eth ${config_path}`
const configFile : ConfigType = require(config_path)

// Check and set start parameters
let startRef: 'latest' | number = 'latest' 
if(typeof argv.block == 'number' || argv.block == 'latest') {
    startRef = argv.block
} else if(process.env['START_BLOCK']) {
    const start_block_env = parseInt(process.env['START_BLOCK'])
    if(isNaN(start_block_env)) {
        console.error('You must supply start block as an integer in env')
        process.exit(1)
    }
    startRef = start_block_env
}
if(configFile.eos.epVerifications > configFile.eos.endpoints.length){
    console.error('Error: epVerifications cannot be greater than given amount of endpoints')
    process.exit(1)
}
let waitCycle : undefined | number = undefined
if(typeof configFile.eth.waitCycle == 'number'){
    waitCycle = configFile.eth.waitCycle
}
if(argv.waiter) {
    waitCycle = argv.waiter 
}

// Set up the oracle
const eosSigProvider = new JsSignatureProvider([configFile.eos.privateKey])
const ethOracle = new EthOracle(configFile, eosSigProvider)
// Run the process
ethOracle.run(startRef, argv.broadcast, waitCycle)

