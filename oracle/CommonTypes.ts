export interface ConfigType {
    precision: number
    symbol: string
    // network: string
    confirmations: number
    eos: {
        network: string,
        // wsEndpoint: string,
        chainId: string,
        endpoint?: string,
        endpoints: Array<string>,
        teleportContract: string,
        oracleAccount: string,
        privateKey: string,
        // genesisBlock: number,
        oraclePermission?: string,
        epVerifications: number
    }
    eth: {
        network: string,
        // wsEndpoint: string,
        chainId: number,
        endpoint?: string,
        endpoints: Array<string>,
        teleportContract: string,
        oracleAccount: string,
        privateKey: string,
        genesisBlock: number,
        epVerifications: number
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
    id: string;
    to_eth: string;
    quantity: string;
}
  
export interface eosio_teleport_data {
    oracle_name: string;
    to: string;
    ref: string;
    quantity: string;
    chain_id: string;
    confirmed: boolean;
}