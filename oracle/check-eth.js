#!/usr/bin/env node

/*
Checks a transaction on ETH/BSC and reports completion status
 */

const config_file = process.env['CONFIG'] || './config';
process.title = `check-eth ${config_file}`;

const {JsonRpc} = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');

const hyperion_endpoint = 'https://api.waxsweden.org';

const config = require(config_file);

const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const rpc = new JsonRpc(config.eos.endpoint, {fetch});


const run = async () => {
    let lower_bound = 0;

    if (process.argv.length > 1){
        const tx_id = process.argv[2].replace(/^0x/, '');
        console.log(`Checking TX 0x${tx_id}`);

        while (true){
            const res = await rpc.get_table_rows({
                code: config.eos.teleportContract,
                scope: config.eos.teleportContract,
                table: 'receipts',
                lower_bound,
                limit: 100
            });

            // console.log(res)

            res.rows.forEach(r => {
                if (r.ref === tx_id){
                    console.log(r)
                }
            });


            if (res.more){
                lower_bound = res.next_key;
            }
            else {
                console.log(`No more entries`);
                break;
            }
        }

    }
    else {
        console.error(`You must specify a transaction id`);
        process.exit(1);
    }
}

run()
