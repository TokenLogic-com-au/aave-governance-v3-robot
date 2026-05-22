import {getNetwork} from '@chainlink/cre-sdk';
import {isAddress, zeroAddress} from 'viem';
import type {Config} from '../types';

export type ChainConfig = {
  chainName: string;
  chainSelector: bigint;
  executor: `0x${string}`;
  steward: `0x${string}`;
  dataProviderV3: `0x${string}`;
  dataProviderV2: `0x${string}` | '';
  collector: `0x${string}`;
  priceOracle: `0x${string}`;
  corePoolV3: `0x${string}`;
  primePoolV3: `0x${string}` | '';
  corePoolV2: `0x${string}` | '';
  hasV2: boolean;
  hasPrimePool: boolean;
};

export function parseChainConfig(input: Config): ChainConfig | null {
  const network = getNetwork({
    chainFamily: 'evm',
    chainSelectorName: input.chainName,
    isTestnet: false,
  });
  if (!network) return null;

  const required: (string | undefined)[] = [
    input.executor,
    input.steward,
    input.dataProviderV3,
    input.collector,
    input.priceOracle,
    input.corePoolV3,
  ];
  for (const value of required) {
    if (!value || !isAddress(value) || value.toLowerCase() === zeroAddress) {
      return null;
    }
  }

  const dataProviderV2 = (input.dataProviderV2 ?? '') as `0x${string}` | '';
  const primePoolV3 = (input.primePoolV3 ?? '') as `0x${string}` | '';
  const corePoolV2 = (input.corePoolV2 ?? '') as `0x${string}` | '';

  return {
    chainName: input.chainName,
    chainSelector: network.chainSelector.selector,
    executor: input.executor as `0x${string}`,
    steward: input.steward as `0x${string}`,
    dataProviderV3: input.dataProviderV3 as `0x${string}`,
    dataProviderV2,
    collector: input.collector as `0x${string}`,
    priceOracle: input.priceOracle as `0x${string}`,
    corePoolV3: input.corePoolV3 as `0x${string}`,
    primePoolV3,
    corePoolV2,
    hasV2: dataProviderV2.length > 0 && corePoolV2.length > 0,
    hasPrimePool: primePoolV3.length > 0,
  };
}

export function parseTokenSet(tokens: string[] | undefined): Set<string> {
  return new Set((tokens ?? []).map((token) => token.toLowerCase()));
}
