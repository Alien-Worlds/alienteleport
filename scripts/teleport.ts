
const fromHexString = hexString =>
    new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))

const toHexString = bytes =>
    bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')

import {Serialize, JsonRpc} from 'eosjs'
import fetch from 'node-fetch'

export class Teleport {
    rpc: any;

    constructor() {
        // console.log(fetch)
        this.rpc = new JsonRpc('https://wax.eosdac.io', {fetch});
    }

    async getSignData(teleportId) {
        const res = await this.rpc.get_table_rows({
            code: 'other.worlds',
            scope: 'other.worlds',
            table: 'teleports',
            lower_bound: teleportId,
            upper_bound: teleportId,
            limit: 1
        });

        if (!res.rows.length){
            throw new Error('could not find teleport');
        }

        const teleportData = res.rows[0];
        console.log(teleportData);

        // logteleport(uint64_t id, uint32_t timestamp, name from, asset quantity, uint8_t chain_id, checksum256 eth_address)
        const sb = new Serialize.SerialBuffer({
            textEncoder: new TextEncoder,
            textDecoder: new TextDecoder
        });
        sb.pushNumberAsUint64(teleportData.id);
        sb.pushUint32(teleportData.time);
        sb.pushName(teleportData.account);
        sb.pushAsset(teleportData.quantity);
        sb.push(teleportData.chain_id);
        sb.pushArray(fromHexString(teleportData.eth_address));

        return {
            claimAccount: '0x' + teleportData.eth_address,
            data: '0x' + toHexString(sb.array.slice(0, 69)),
            signatures: teleportData.signatures
        };
    }
}
