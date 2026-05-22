import {cre} from '@chainlink/cre-sdk';

type GsmConfig = {
  address: `0x${string}`;
};

export type EVMClient = InstanceType<typeof cre.capabilities.EVMClient>;

export type NetworkConfig = {
  chainName: string;
  mailboxAddress: `0x${string}`;
  gsms: GsmConfig[];
};

export type Config = {
  schedule: string;
  evms: NetworkConfig[];
};
