import type {ChainConfig} from './config';

export function getDestinationPool(
  tokenStr: string,
  config: ChainConfig,
  primeTokensSet: Set<string>
): `0x${string}` {
  if (config.hasPrimePool && primeTokensSet.has(tokenStr)) {
    return config.primePoolV3 as `0x${string}`;
  }
  return config.corePoolV3;
}
