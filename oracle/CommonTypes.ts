export type ConfigType = {
  precision: number;
  symbol: string;
  network: string;
  eos: {
    wsEndpoint: string;
    chainId: string;
    endpoint: string;
    teleportContract: string;
    oracleAccount: string;
    privateKey: string;
    genesisBlock: number;
    oraclePermission?: string;
  };
  eth: {
    wsEndpoint: string;
    chainId: string;
    endpoint: string;
    teleportContract: string;
    oracleAccount: string;
    privateKey: string;
    genesisBlock: number;
  };
};
