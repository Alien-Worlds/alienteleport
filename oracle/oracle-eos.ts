import { RpcError, Serialize } from "eosjs"
import { GetTableRowsResult } from 'eosjs/dist/eosjs-rpc-interfaces'
import { JsSignatureProvider } from "eosjs/dist/eosjs-jssig"
import { TextDecoder, TextEncoder } from "text-encoding"
import { ecsign, keccak, toRpcSig } from "ethereumjs-util"
import { EosApi } from './EndpointSwitcher'
import { ConfigType, TeleportTableEntry } from './CommonTypes'
import yargs from 'yargs'

/**
 * Convert an Uint8Array to an hex in string format
 * @param bytes Uint8Array
 * @returns Hex in string format
 */
function toHexString(bytes: Uint8Array){
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
}

/**
 * Convert a hex in string format to an Uint8Array
 * @param hexString Hex in string format
 * @returns Uint8Array
 */
function fromHexString(hexString: string){
    let str = hexString.match(/.{1,2}/g)
    return str == null? new Uint8Array() : new Uint8Array(str.map(byte => parseInt(byte, 16)))
}

/**
 * Use this function with await to let the thread sleep for the defined amount of time
 * @param ms Milliseconds
 */
const sleep = async (ms: number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

// /**
//  * Check if two Uint8Arrays are equal
//  * @param a Frist array
//  * @param b Seconf array
//  * @returns True or false
//  */
// function arraysEqual(a: Uint8Array, b: Uint8Array) {
//     if (a === b) return true
//     if (a == null || b == null) return false
//     if (a.length !== b.length) return false

//     for (var i = 0; i < a.length; ++i) {
//       if (a[i] !== b[i]) return false
//     }
//     return true
//   }

class EosOracle{
    private eos_api: EosApi
    public running = false
    private irreversible_time = 0
    static maxWait = 180    // The max amount of seconds to wait to check an entry again if it is irreversible now

    constructor(private config: ConfigType, private signatureProvider: JsSignatureProvider){
        this.eos_api = new EosApi(this.config.eos.netId, this.config.eos.endpoints, this.signatureProvider)
    }

    /**
     * Send sign a teleport. Repeats itself until a defined amount of tries are reached 
     * @param id Teleport id
     * @param signature Signature of this oracle
     * @param tries Already passed tries
     */
    async sendSignAction(id: number, signature: string, tries = 0){
        try{
            console.log(`Teleport id ${id}, try to send signature ${tries}.`)
            const result = await this.eos_api.getAPI().transact({
                actions: [{
                    account: this.config.eos.teleportContract,
                    name: 'sign',
                    authorization: [{
                        actor: this.config.eos.oracleAccount,
                        permission: this.config.eos.oraclePermission || 'active',
                    }],
                    data: {
                        oracle_name: this.config.eos.oracleAccount,
                        id,
                        signature
                    },
                }]
            }, {
                blocksBehind: 3,
                expireSeconds: 30,
            })
        } catch (e) {
            console.error(`\nCaught exception: ${e} \n`)
            let retry = true
            if (e instanceof RpcError){
                if('code' in e.json){
                    switch(e.json.code){
                        case 401:                   // Unauthorized 
                        retry = false
                        break
                    }
                }
            }
            tries++
            if(tries < this.config.eos.endpoints.length && retry){
                await this.eos_api.nextEndpoint()
                await this.sendSignAction(id, signature, tries)
            } else {
                console.error(`Teleport id ${id}, skip sign action. ❌`)
            }
            return
        }
        console.log(`Teleport id ${id}, successful send sign action. ✔️`)
    }
    
    /**
     * Get table rows
     * @param lower_bound Start teleport id 
     * @param limit Amount of requested rows 
     * @param json True for entries in json format and false for raw (string) format
     * @returns Teleport table rows result 
     */
    async getTableRows(lower_bound: number, limit: number, json = true){
        let retries = 0
        let teleport_res : GetTableRowsResult | null = null
        let gotTeleport = false
        do{
            if(retries >= 10){   
                throw new Error(`Got no result by endpoint ${this.eos_api.getEndpoint()}.`)
            }
            try{
                retries++
                teleport_res = await this.eos_api.getRPC().get_table_rows({
                    json,
                    code: this.config.eos.teleportContract,
                    scope: this.config.eos.teleportContract,
                    table: 'teleports',
                    lower_bound,
                    limit
                })
            } catch(e){
                console.log(e)
                await this.eos_api.nextEndpoint()
            }
            if(teleport_res == null || 'rows' in teleport_res == false){
                console.log(`Got no teleports. Try ${retries}.`)
            } else {
                gotTeleport = true
            }
        } while(!gotTeleport)
        
        return teleport_res as GetTableRowsResult
    }
          
    /**
     * Serialize the table entry of a teleport 
     * @param teleport Parameters of a teleport table entry  
     * @param logSize Trim the serialized data to this size
     * @returns Serialized data as Uint8Array
     */
    static serializeLogData(teleport: {id: number, time: number, account: string, quantity: string, chain_id: number, eth_address: string}, logSize: number){
        // Serialize the values
        const sb = new Serialize.SerialBuffer({
            textEncoder: new TextEncoder,
            textDecoder: new TextDecoder
        })
        sb.pushNumberAsUint64(teleport.id)
        sb.pushUint32(teleport.time)
        sb.pushName(teleport.account)
        sb.pushAsset(teleport.quantity)
        sb.push(teleport.chain_id)
        sb.pushArray(fromHexString(teleport.eth_address))
        return sb.array.slice(0, logSize)
    }
    
    /**
     * Get signature for teleport data
     * @param logData Serialized teleport table entry
     * @returns Signature
     */
    static async signTeleport(logData: Uint8Array, privateKey: string){
        // Sha3 of the serilized values. Note: The same result is one parameter for the claim function on the eth chain
        const logDataKeccak = keccak(Buffer.from(logData))
        
        // console.log('logData', Buffer.from(logData).toString('hex'))
        // console.log('logDataKeccak', logDataKeccak.toString('hex'))
        
        // Sign the sha3 hash
        const ethPriKey = Buffer.from(privateKey, "hex")
        const sig = ecsign(logDataKeccak, ethPriKey)
        toRpcSig(sig.v, sig.r, sig.s)
        return toRpcSig(sig.v, sig.r, sig.s)
    }
    
    /**
     * Get an amount of teleport entries as json, severall times from different endpoints for verification and the lowest amount of entries provided over all used endpoints  
     * @param request.lowerId Get endpoints beginning by this teleport id number
     * @param request.amount Amount of requested teleports
     * @returns teleport array in json format, array of teleport arrays in row format and minimum amount of provided entries
     */
    async getNextTeleports(request: {lowerId: number, amount: number}){
        // Get the next teleports in json format
        const chain_data = await this.getTableRows(request.lowerId, request.amount, true) as GetTableRowsResult
        let lowest_amount = chain_data.rows.length
        
        // Get the teleports in raw format from other endpoints for verification
        let verify_data : Array<Array<string>> = []
        if(lowest_amount > 0){
            const initialEndpoint = this.eos_api.getEndpoint()
            for(let i = 1; i < this.config.eos.epVerifications; i++){
                await this.eos_api.nextEndpoint()
                const vData = (await this.getTableRows(request.lowerId, request.amount, false) as GetTableRowsResult).rows as Array<string>
                verify_data.push(vData)
                if(initialEndpoint == this.eos_api.getEndpoint()){
                    console.error('No available endpoints for verification. ⛔')
                    process.exit(1)
                }
                // Handle only to the lowest amount of entries  
                if(lowest_amount > vData.length){
                    lowest_amount = vData.length 
                }
            }
        }
        return {chain_data, verify_data, lowest_amount}
    }
    
    /**
     * Update the current block time and the last irreversible block time
     */
    async updateTimes(){
        
        let minIrrTime = this.irreversible_time
        // let minCurrentTimeMs = this.current_block_time
        let lowestIrr: number | undefined = undefined
        let epStart = this.eos_api.getEndpoint()
        let verifications = 0
        do{
            try{
                // Get current info
                let info = await this.eos_api.getRPC().get_info()
                let irr_time : number
                
                if(info.last_irreversible_block_time){
                    // Get last irreversible block time if available
                    irr_time = new Date(info.last_irreversible_block_time + 'Z').getTime()
                } else if (info.last_irreversible_block_num){
                    // Get last irreversible block time from last irreversible block
                    let irr_block = await this.eos_api.getRPC().get_block(info.last_irreversible_block_num)
                    irr_time = new Date(irr_block.timestamp + 'Z').getTime()                    
                } else {
                    throw('No time parameter given by ' + this.eos_api.getEndpoint())
                }

                if(typeof irr_time == 'number'){
                    // Convert to full seconds
                    let t = Math.floor(irr_time / 1000)
                    if(t < minIrrTime){
                        throw(`Irreversible time is lower than possible, occurred by using ${this.eos_api.getEndpoint()}`)
                    } else if(lowestIrr === undefined || t < lowestIrr) {
                        // New lowest possible irreversible time
                        lowestIrr = t
                    }
                } else {
                    throw(`Time parameter is not a number, occurred by using ${this.eos_api.getEndpoint()}`)
                }
                verifications++
            } catch(e) {
                console.log('⚡️ ' + e)
                // Get next endpoint and check if all endpoints are already checked
                this.eos_api.nextEndpoint()
                if(epStart == this.eos_api.getEndpoint()){
                    throw('Could not get last irreversible block time from any endpoint. ⛔')
                }
            }
        } while(verifications < this.config.eos.epVerifications)

        // Set new time values
        if(lowestIrr){
            this.irreversible_time = lowestIrr
        }
    }

    /**
     * Sign all teleports 
     * @param signProcessData.lowerId Id of teleport to start from. Will be updated by the handled amount of teleports.
     * @param signProcessData.amount Amount of requested teleports
     */
    async signAllTeleportsUntilNow(signProcessData: {lowerId: number, amount: number}){
        
        let waitForIrr = 0
        let lastHandledId = signProcessData.lowerId

        // Get next teleports
        let {chain_data, verify_data, lowest_amount} = await this.getNextTeleports(signProcessData)
        
        for(let rowIndex = 0; rowIndex < lowest_amount; rowIndex++) {
            const item = chain_data.rows[rowIndex] as TeleportTableEntry
            
            // Check if already claimed anf if the required amount of signes is already reached
            if(item.claimed){
                console.log(`Teleport id ${item.id}, is already claimed. ✔️`)
                lastHandledId = item.id + 1
                continue
            }
            // Check if the required amount of signes is already reached
            if(item.oracles.length >= this.config.confirmations){
                console.log(`Teleport id ${item.id}, has already sufficient confirmations. ✔️`)
                lastHandledId = item.id + 1
                continue
            }
            // Check if this oracle account has already signed
            if(item.oracles.find(oracle => oracle == this.config.eos.oracleAccount) != undefined){
                console.log(`Teleport id ${item.id}, has already signed. ✔️`)
                lastHandledId = item.id + 1
                continue
            }
            
            // Serialize the teleport table entry
            const logData = EosOracle.serializeLogData(item, 69)
            const logDataHex = toHexString(logData)
            
            // Verify serialization
            let isVerifyed = true
            for(let i = 0; i < this.config.eos.epVerifications - 1; i++){ 
                if(logDataHex != verify_data[i][rowIndex].slice(0, logData.length * 2)){
                    console.error(`Verification failed by ${this.eos_api.getEndpoint()}. ⚠️`)
                    isVerifyed = false
                }
                // console.log(`Teleport id ${item.id}, verified ${i + 1} times`)
            }

            // Check time
            if(item.time > this.irreversible_time){
                waitForIrr = item.time - this.irreversible_time
                lastHandledId = item.id
                break
            }

            if(!isVerifyed){
                console.error(`Teleport id ${item.id}, skip this one. ❌`)
            } else {
                // Sign the serialized teleport
                const signature = await EosOracle.signTeleport(logData, this.config.eth.privateKey)
                
                // Send signature to eosio chain
                await this.sendSignAction(item.id, signature)
            }
            lastHandledId = item.id + 1
        }
        
        // Set next teleport id and get the next teleports
        signProcessData.lowerId = lastHandledId
        if(this.running){
            if(waitForIrr > 0){
                // Wait maximal 180 seconds
                if(waitForIrr > EosOracle.maxWait) {
                    waitForIrr = EosOracle.maxWait
                }
                console.log(`Wait ${waitForIrr} seconds until teleport id ${signProcessData.lowerId} is irreversible.`)
                await EosOracle.WaitWithAnimation(waitForIrr)
                await this.signAllTeleportsUntilNow(signProcessData)
            }
            else if(chain_data.more == true){
                await this.updateTimes()
                await this.signAllTeleportsUntilNow(signProcessData)
            }
        }
    }
    
    /**
     * Wait for a defined amount of time and show remaining seconds
     * @param s Seconds to wait
     */
    static async WaitWithAnimation(s: number, info: string = ""){
        process.stdout.write(info + "\n\x1b[?25l")
        for(let i = 0; i < s; i++){
            process.stdout.write(`💤 ${i} s / ${s} s 💤`)
            await sleep(1000)
            process.stdout.write("\r\x1b[K")
        }
        
        process.stdout.moveCursor(0, -1) // up one line
        process.stdout.clearLine(1) // from cursor to end
    }

    /**
     * Run the process of signing eosio chain teleports to eth chain
     * @param id Teleport id to start from
     * @param requestAmount Amount of requested teleports per request
     */
    async run(id = 0, requestAmount = 100, waitCycle = EosOracle.maxWait){
        console.log(`Starting EOS watcher for ETH oracle ${this.config.eth.oracleAccount}`)
        
        // Create an object to change the current id on each run
        this.running = true
        try{
            const signProcessData = {lowerId: id, amount: requestAmount}
            while(this.running){
                await this.eos_api.nextEndpoint()
                await this.updateTimes()
                await this.signAllTeleportsUntilNow(signProcessData)
                await EosOracle.WaitWithAnimation(waitCycle, 'All available teleports signed')
            }
        } catch (e){
            console.error('⚡️ ' + e)
        }
        console.log('Thread closed 💀')
    }
}

// Handle params from console
const argv = yargs
    .version().alias('version', 'v')
    .option('id', {
        alias: 'n',
        description: 'Teleport id to start from',
        type: 'number'
    })
    .option('amount', {
        alias: 'a',
        description: 'Amount of handled teleports per requests',
        type: 'number'
    })
    .option('signs', {
        alias: 's',
        description: 'Amount of signatures until this oracle will sign too',
        type: 'number'
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
    .help().alias('help', 'h').argv as {
        id: number,
        amount: number,
        signs: number,
        waiter: number,
        config: string,
    }

// Load config and set title
const config_path = argv.config || process.env['CONFIG'] || './config'
process.title = `oracle-eos ${config_path}`
const configFile : ConfigType = require(config_path)

// Configure eosjs specific propperties
const signatureProvider = new JsSignatureProvider([configFile.eos.privateKey])
const eosOracle = new EosOracle(configFile, signatureProvider)

// Get time to wait for each round by config file or comsole parameters
let waitCycle : undefined | number = undefined
if(typeof configFile.eos.waitCycle == 'number'){
    waitCycle = configFile.eos.waitCycle
}
if(argv.waiter) {
    waitCycle = argv.waiter 
}

// Run the process
eosOracle.run(argv.id, argv.amount, waitCycle)