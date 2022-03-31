export type ConfigType = {
    precision: number;
    symbol: string;
    // network: string;
    confirmations: number;
    eos: {
      network: string;
      // wsEndpoint: string;
      chainId: string;
      // endpoint: string;
      endpoints: Array<string>,
      teleportContract: string;
      oracleAccount: string;
      privateKey: string;
      // genesisBlock: number;
      oraclePermission?: string;
      epVerifications: number;
    };
    eth: {
      network: string;
      // wsEndpoint: string;
      chainId: string;
      endpoint: string;
      teleportContract: string;
      oracleAccount: string;
      privateKey: string;
      genesisBlock: number;
    };
  };