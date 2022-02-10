#!/usr/bin/env node

/*
Lists all incomplete teleports from eos -> eth
 */

const config_file = process.env['CONFIG'] || './config';
process.title = `incomplete-eos ${config_file}`;

import { Api, JsonRpc } from 'eosjs';
import { JsSignatureProvider } from 'eosjs/dist/eosjs-jssig';
import fetch from 'node-fetch';
import { TableFetcher } from 'eosio-helpers';

const hyperion_endpoint = 'https://api.waxsweden.org';

const config = require(config_file);

const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
const rpc = new JsonRpc(config.eos.endpoint, { fetch });
// const eos_api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

interface TeleportRow {
  id: number;
  time: Date;
  account: string;
  quantity: string;
  chain_id: string;
  eth_address: string;
  oracles: string[];
  signatures: string[];
  claimed: number;
}

const run = async () => {
  let allTeleports: TeleportRow[] = await TableFetcher({
    codeContract: config.eos.teleportContract,
    scope: config.eos.teleportContract,
    table: 'teleports',
    batch_size: 100,
    sleepMS: 0,
    endpoint: config.eos.endpoint,
    lower_bound: '1',
    limit: (rows) => {
      return rows.find((r) => r.eth_address.match('4D35c83e994')) != undefined;
    },
  });

  const incomplete = allTeleports.filter(({ signatures, eth_address }) => {
    // signatures.length < 3;
    return eth_address.match('4D35c83e994') != null;
  });

  console.log('incomplete:', incomplete);
  return;

  console.log(
    'Incomplete: with less than 3 sigs',
    incomplete.length,
    ' from: ',
    allTeleports.length,
    ' rows'
  );
  console.log(JSON.stringify(incomplete));

  console.log('\n\n');

  for (let i = 0; i < incomplete.length; i++) {
    var missed: { act: any; block_num: any }[];
    try {
      const url = `${hyperion_endpoint}/v2/history/get_actions?account=${incomplete[i].account}&filter=other.worlds:teleport&count=100`;
      const res = await fetch(url);
      const json = await res.json();
      console.log('Teleport action: ', json.actions[0]);
      missed = json.actions
        .map(({ act, block_num }: { act: any; block_num: any }) => ({
          act,
          block_num,
        }))
        .filter(
          ({
            act: {
              data: { quantity, eth_address },
            },
          }: {
            act: { data: { quantity: any; eth_address: string } };
          }) =>
            quantity === incomplete[i].quantity &&
            eth_address.toLowerCase() ===
              incomplete[i].eth_address.toLowerCase()
        );

      if (missed.length) {
        console.log(
          `${incomplete[i].account} - ${
            incomplete[i].id
          }, oracles : ${JSON.stringify(incomplete[i].oracles)}, amount : ${
            incomplete[i].quantity
          }, block_num : ${missed[0].block_num}`
        );
      }
    } catch (e) {
      console.error(e.message);
      i--;
    }
    console.log(
      incomplete[i],
      JSON.stringify(missed)
      // missed.act,
      // missed.block_num
    );
  }
};

run()
  .then((r) => {
    console.log('result:', r);
  })
  .catch((e) => {
    console.error('error: ', e);
  });
