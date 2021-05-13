#!/usr/bin/env node

/*
Lists all incomplete teleports from eos -> eth
 */

const config_file = process.env['CONFIG'] || './config';
process.title = `incomplete-eos ${config_file}`;

const {Api, JsonRpc, Serialize} = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');
const { TextDecoder, TextEncoder } = require('text-encoding');

const hyperion_endpoint = 'https://api.waxsweden.org';

const config = require(config_file);

const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const rpc = new JsonRpc(config.eos.endpoint, {fetch});
const eos_api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });


const run = async () => {
    let lower_bound = 1;
    const incomplete = [];
    while (true){
        const res = await rpc.get_table_rows({
            code: config.eos.teleportContract,
            scope: config.eos.teleportContract,
            table: 'teleports',
            lower_bound,
            limit: 100
        });

        // console.log(res)

        res.rows.forEach(r => {
            if (r.signatures.length < 3){
                incomplete.push(r);
            }
        });


        if (res.more){
            lower_bound = res.next_key;
        }
        else {
            break;
        }
    }

    // console.log(incomplete);

    for (let i = 0; i < incomplete.length; i++){
        try {
            const url = `${hyperion_endpoint}/v2/history/get_actions?account=${incomplete[i].account}&filter=other.worlds:teleport&count=100`;
            const res = await fetch(url);
            const json = await res.json();
            // console.log(json.actions[0])
            const missed = json.actions.map(a => {
                return {act: a.act, block_num: a.block_num}
            }).filter(t => t.act.data.quantity === incomplete[i].quantity && t.act.data.eth_address.toLowerCase() === incomplete[i].eth_address.toLowerCase());

            if (missed.length){
                console.log(`${incomplete[i].account} - ${incomplete[i].id}, oracles : ${JSON.stringify(incomplete[i].oracles)}, amount : ${incomplete[i].quantity}, block_num : ${missed[0].block_num}`);
            }
        }
        catch (e) {
            // console.error(e.message);
            i--;
        }
        // console.log(incomplete[i], JSON.stringify(missed), missed.act, missed.block_num);
    }
}

run()
