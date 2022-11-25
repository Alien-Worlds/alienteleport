export interface ConfigType {
    precision: number
    symbol: string
    // network: string
    confirmations: number
    eos: {
        network: string,
        // wsEndpoint: string,
        netId: string,
        id?: number,
        endpoint?: string,
        endpoints: Array<string>,
        teleportContract: string,
        oracleAccount: string,
        privateKey: string,
        // genesisBlock: number,
        oraclePermission?: string,
        epVerifications: number,
        waitCycle: number,
    }
    eth: {
        network: string,
        // wsEndpoint: string,
        netId?: string,
        id?: bigint | number | string,
        endpoint?: string,
        endpoints: Array<string>,
        teleportContract: string,
        oracleAccount: string,
        privateKey: string,
        genesisBlock: number,
        epVerifications: number,
        waitCycle?: number,
        blocksToWait?: number,
    }
}

export interface TeleportTableEntry{
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

export interface eosio_claim_data {
    oracle_name: string;
    id: number;
    to_eth: string;
    quantity: string;
}
  
export interface eosio_teleport_data {
    oracle_name: string;
    to: string;
    ref: string;
    quantity: string;
    chain_id: number;
    confirmed: boolean;
}