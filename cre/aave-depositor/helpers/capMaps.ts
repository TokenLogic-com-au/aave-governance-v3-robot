import {type Runtime} from '@chainlink/cre-sdk';
import type {EVMClient} from '../types';
import {zeroAddress} from 'viem';
import type {DataProviderV3, ReserveCaps, ReserveTokensAddresses} from './DataProviderV3';
import {batchGetTotalSupplies} from './erc20';

type CapSupplyMaps = {
  tokenAddrsForCapped: (ReserveTokensAddresses | null)[];
  supplyByCappedPos: Map<number, bigint | null>;
  eligIdxToCappedPos: Map<number, number>;
};

export function buildCapSupplyMaps(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  eligibleTokens: `0x${string}`[],
  caps: (ReserveCaps | null)[],
  dataProviderV3: DataProviderV3
): CapSupplyMaps {
  const cappedIndices = caps
    .map((cap, eligIdx) => (cap !== null && cap.supplyCap > 0n ? eligIdx : null))
    .filter((eligIdx): eligIdx is number => eligIdx !== null);

  if (cappedIndices.length === 0) {
    return {tokenAddrsForCapped: [], supplyByCappedPos: new Map(), eligIdxToCappedPos: new Map()};
  }

  const cappedTokens = cappedIndices.map((eligIdx) => eligibleTokens[eligIdx]);
  const tokenAddrsForCapped = dataProviderV3.batchGetReserveTokensAddresses(cappedTokens);

  // Collect the aTokens we need totalSupply() for, then batch-fetch and index by aToken address.
  const aTokensForCapped = tokenAddrsForCapped.map((addrs) =>
    addrs && addrs.aTokenAddress !== zeroAddress ? addrs.aTokenAddress : null
  );
  const validATokens = aTokensForCapped.filter(
    (aToken): aToken is `0x${string}` => aToken !== null
  );
  const supplies = batchGetTotalSupplies(runtime, evmClient, validATokens);
  const supplyByAToken = new Map<`0x${string}`, bigint | null>();
  for (let i = 0; i < validATokens.length; i++) {
    supplyByAToken.set(validATokens[i], supplies[i]);
  }

  const supplyByCappedPos = new Map<number, bigint | null>();
  const eligIdxToCappedPos = new Map<number, number>();
  for (let cappedPos = 0; cappedPos < cappedIndices.length; cappedPos++) {
    const aToken = aTokensForCapped[cappedPos];
    supplyByCappedPos.set(cappedPos, aToken !== null ? supplyByAToken.get(aToken) ?? null : null);
    eligIdxToCappedPos.set(cappedIndices[cappedPos], cappedPos);
  }

  return {tokenAddrsForCapped, supplyByCappedPos, eligIdxToCappedPos};
}
