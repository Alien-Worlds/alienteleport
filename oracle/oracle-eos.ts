import { RpcError, Serialize } from "eosjs";
import { GetTableRowsResult } from 'eosjs/dist/eosjs-rpc-interfaces';
import { JsSignatureProvider } from "eosjs/dist/eosjs-jssig";
import { TextDecoder, TextEncoder } from "text-encoding";
import { ecsign, keccak, toRpcSig } from "ethereumjs-util";
import { EosApi } from './eosEndpointSwitcher'
import { ConfigType } from './CommonTypes';

interface TeleportTableEntry{
    id: number, 
    time: number, 
    account: string, 
    quantity: string, 
    chain_id: number, 
    eth_address: string, 
    oracles: Array<string>, 
    signatures: Array<string>, 
    claimed: boolean
}

// Load config and set title
const config_file = process.env['CONFIG'] || './config';
const config : ConfigType = require(config_file);
process.title = `oracle-eos ${config_file}`;

// Configure eosjs specific propperties
const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const eos_api = new EosApi(config.eos.chainId, config.eos.endpoints, signatureProvider)

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
        setTimeout(resolve, ms);
    });
};

/**
 * Send sign a teleport. Repeats itself until a defined amount of tries are reached 
 * @param id Teleport id
 * @param signature Signature of this oracle
 * @param tries Already passed tries
 */
async function sendSignAction(id: number, signature: string, tries = 0){
    try{
        console.log(`Teleport id ${id}, try to send signature ${tries}.`)
        const result = await eos_api.getAPI().transact({
            actions: [{
              account: config.eos.teleportContract,
              name: 'sign',
              authorization: [{
                actor: config.eos.oracleAccount,
                permission: config.eos.oraclePermission || 'active',
              }],
              data: {
                oracle_name: config.eos.oracleAccount,
                id,
                signature
              },
            }]
          }, {
            blocksBehind: 3,
            expireSeconds: 30,
          });
    } catch (e) {
        console.error(`\nCaught exception: ${e} \n`);
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
        if(tries < config.eos.endpoints.length && retry){
            await eos_api.nextEndpoint()
            await sendSignAction(id, signature, tries)
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
async function getTableRows(lower_bound: number, limit: number, json = true){
    let retries = 0
    let teleport_res : GetTableRowsResult | null = null
    let gotTeleport = false
    do{
        if(retries >= 10){   
            throw new Error(`Got no result by endpoint ${eos_api.getEndpoint()}.`)
        }
        try{
            retries++
            teleport_res = await eos_api.getRPC().get_table_rows({
                json,
                code: config.eos.teleportContract,
                scope: config.eos.teleportContract,
                table: 'teleports',
                lower_bound,
                // upper_bound: 100,
                limit
            });
        } catch(e){
            console.log(e)
            await eos_api.nextEndpoint()
        }
        if(teleport_res == null || 'rows' in teleport_res == false){
            console.log(`Got no teleports. Try ${retries}.`)
        } else {
            gotTeleport = true
        }
    } while(!gotTeleport)

    return teleport_res as GetTableRowsResult;
}

/**
 * Serialize the table entry of a teleport 
 * @param teleport Parameters of a teleport table entry  
 * @param logSize Trim the serialized data to this size
 * @returns Serialized data as Uint8Array
 */
function serializeLogData(teleport: {id: number, time: number, account: string, quantity: string, chain_id: number, eth_address: string}, logSize: number){
    // Serialize the values
    const sb = new Serialize.SerialBuffer({
        textEncoder: new TextEncoder,
        textDecoder: new TextDecoder
    });
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
async function signTeleport(logData: Uint8Array){
    // Sha3 of the serilized values. Note: The same result is one parameter for the claim function on the eth chain
    const logDataKeccak = keccak(Buffer.from(logData))

    // console.log('logData', Buffer.from(logData).toString('hex'));
    // console.log('logDataKeccak', logDataKeccak.toString('hex'));
    
    // Sign the sha3 hash
    const ethPriKey = Buffer.from(config.eth.privateKey, "hex")
    const sig = ecsign(logDataKeccak, ethPriKey)
    toRpcSig(sig.v, sig.r, sig.s)
    return toRpcSig(sig.v, sig.r, sig.s)
}

/**
 * Get the parameters which are defined via console
 * @returns Parameters
 */
function getConsoleParams(){
    let id = 0;
    if (typeof process.argv[2] !== 'undefined'){
        // Get id by console parameter
        switch(process.argv[2]){
            case 'id': 
            if(typeof process.argv[3] == 'undefined'){
                console.error(`Missing id number.`);
                process.exit(1);
            }
            id = parseInt(process.argv[3])
            if (isNaN(id)){
                console.error(`Start id must be a number.`);
                process.exit(1);
            }
            break;
            default:
                console.error(`Undefined console parameter.`);
                process.exit(1);
        }
    }
    return { id }
}

/**
  * Get an amount of teleport entries as json, severall times from different endpoints for verification and the lowest amount of entries provided over all used endpoints  
 * @param request.lowerId Get endpoints beginning by this teleport id number
 * @param request.amount Amount of requested teleports
 * @returns teleport array in json format, array of teleport arrays in row format and minimum amount of provided entries
 */
async function getNextTeleports(request: {lowerId: number, amount: number}){
  // Get the next teleports in json format
  const chain_data = await getTableRows(request.lowerId, request.amount, true) as GetTableRowsResult
  let lowest_amount = chain_data.rows.length
  
  // Get the the teleports in raw format from other endpoints for verification
  let verify_data : Array<Array<string>> = []
  const initialEndpoint = eos_api.getEndpoint()
  for(let i = 1; i < config.eos.epVerifications; i++){
      await eos_api.nextEndpoint()
      const vData = (await getTableRows(request.lowerId, request.amount, false) as GetTableRowsResult).rows as Array<string>
      verify_data.push(vData)
      if(initialEndpoint == eos_api.getEndpoint()){
          console.error('No available endpoints for verification. ⛔')
          process.exit(1)
      }
      // Handle only to the lowest amount of entries  
      if(lowest_amount > vData.length){
        lowest_amount = vData.length 
      }
  }
  return {chain_data, verify_data, lowest_amount}
}

/**
 * Sign all teleports 
 * @param signProcessData.lowerId Id of teleport to start from. Will be updated by the handled amount of teleports.
 * @param signProcessData.amount Amount of requested teleports
 */
async function signAllTeleportsUntilNow(signProcessData: {lowerId: number, amount: number}){
    // Get next teleports
    let {chain_data, verify_data, lowest_amount} = await getNextTeleports(signProcessData)
    
    for(let rowIndex = 0; rowIndex < lowest_amount; rowIndex++){
        const item = chain_data.rows[rowIndex] as TeleportTableEntry
        // Check if already claimed anf if the required amount of signes is already reached
        if(item.claimed){
            console.log(`Teleport id ${item.id}, is already claimed. ✔️`)
            continue
        }
        // Check if the required amount of signes is already reached
        if(item.oracles.length >= config.confirmations){
            console.log(`Teleport id ${item.id}, has already sufficient confirmations. ✔️`)
            continue
        }
        // Check if this oracle account has already signed
        if(item.oracles.find(oracle => oracle == config.eos.oracleAccount) != undefined){
            console.log(`Teleport id ${item.id}, has already signed. ✔️`)
            continue
        }

        // Serialize the teleport table entry
        const logData = serializeLogData(item, 69)
        const logDataHex = toHexString(logData)

        // Verify serialization
        let isVerifyed = true
        for(let i = 0; i < config.eos.epVerifications - 1; i++){ 
            if(logDataHex != verify_data[i][rowIndex].slice(0, logData.length * 2)){
                console.error(`Verification failed by ${eos_api.getEndpoint()}. ⚠️`)
                isVerifyed = false
            }
            // console.log(`Teleport id ${item.id}, verified ${i + 1} times`);
        }

        if(!isVerifyed){
            console.error(`Teleport id ${item.id}, skip this one. ❌`)
        } else {
            // Sign the serialized teleport
            const signature = await signTeleport(logData)
            
            // Send signature to eosio chain
            await sendSignAction(item.id, signature)
        }
    }

    // Set last handled teleport id and get next teleports
    signProcessData.lowerId += lowest_amount
    if(chain_data.more == true){
        await signAllTeleportsUntilNow(signProcessData)
    }
}

/**
 * Wait 5 seconds
 */
async function WaitAnimation(){
    process.stdout.write('All available teleports signed\x1b[?25l')
    await sleep(1000)
    process.stdout.write(' 💤')
    await sleep(1000)
    process.stdout.write(' 💤')
    await sleep(1000)
    process.stdout.write(' 💤')
    await sleep(1000)
    process.stdout.write(' ↩️')
    await sleep(1000)
    process.stdout.write("\r\x1b[K")
}

/**
 * Run the process of signing eosio chain teleports to eth chain
 */
const run = async () => {
    console.log(`Starting EOS watcher for ETH oracle ${config.eth.oracleAccount}`);
    
    // Get start id from console if defined
    let params = getConsoleParams()

    const signProcessData = {lowerId: params.id, amount: 100}
    while(true){
        eos_api.nextEndpoint()
        await signAllTeleportsUntilNow(signProcessData)
        await WaitAnimation()
    }
}

run();