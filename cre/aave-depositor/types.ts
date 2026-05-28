import {cre} from '@chainlink/cre-sdk';

export type Config = {
  schedule: string;
  chainName: string;
  executor: string;
  steward: string;
  dataProviderV3: string;
  dataProviderV2?: string;
  collector: string;
  priceOracle: string;
  corePoolV3: string;
  primePoolV3?: string;
  corePoolV2?: string;
  depositMinUsd: string;
  migrationMinUsd: string;
  migrationBps: string;
  maxBps: string;
  ignoredTokens: string[];
  primeTokens: string[];
  _rolesModifier?: string;
  _roleKey?: string;
};

export type EVMClient = InstanceType<typeof cre.capabilities.EVMClient>;

export type Result<T> = {ok: true; value: T} | {ok: false; error: string};
