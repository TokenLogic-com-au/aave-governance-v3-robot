import type {Runtime} from '@chainlink/cre-sdk';
import type {EVMClient} from '../types';
import {encodeFunctionData} from 'viem';
import type {DataProviderV3, ReserveConfigData} from './DataProviderV3';
import {ISteward} from '../../contracts/abi/ISteward';
import {applySupplyCapAdjustment} from './caps';
import {batchGetErc20Balances} from './erc20';
import {calculateUsdValue, formatUsd} from './usdValue';
import {getDestinationPool} from './pools';
import type {ChainConfig} from './config';
import {buildCapSupplyMaps} from './capMaps';

export function buildDepositCalls(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  tokenAddresses: `0x${string}`[],
  prices: bigint[],
  configs: (ReserveConfigData | null)[],
  dataProviderV3: DataProviderV3,
  config: ChainConfig,
  primeTokensSet: Set<string>,
  ignoredTokensSet: Set<string>,
  depositMinUsd: bigint
): `0x${string}`[] {
  const calls: `0x${string}`[] = [];

  const balances = batchGetErc20Balances(runtime, evmClient, tokenAddresses, config.collector);

  const eligible: number[] = [];
  let skippedIgnored = 0;
  let skippedInactive = 0;
  let skippedNoBalance = 0;
  let skippedBelowMin = 0;
  let totalIdleUsd = 0n;

  for (const [i, token] of tokenAddresses.entries()) {
    const tokenStr = token.toLowerCase();
    if (ignoredTokensSet.has(tokenStr)) {
      skippedIgnored++;
      continue;
    }
    const cfg = configs[i];
    if (!cfg || !cfg.isActive || cfg.isFrozen) {
      skippedInactive++;
      continue;
    }
    const balance = balances[i];
    if (!balance) {
      skippedNoBalance++;
      continue;
    }
    const usdValue = calculateUsdValue(balance, prices[i], cfg.decimals);
    totalIdleUsd += usdValue;
    if (usdValue < depositMinUsd) {
      skippedBelowMin++;
      continue;
    }
    eligible.push(i);
  }

  runtime.log(
    `  Collector idle value: ${formatUsd(totalIdleUsd)} across ${tokenAddresses.length} tokens` +
      ` (ignored=${skippedIgnored} inactive=${skippedInactive} no-balance=${skippedNoBalance} below-min=${skippedBelowMin} eligible=${eligible.length})`
  );

  if (eligible.length === 0) return calls;

  const eligibleTokens = eligible.map((i) => tokenAddresses[i]);
  const caps = dataProviderV3.batchGetReserveCaps(eligibleTokens);

  const capMaps = buildCapSupplyMaps(runtime, evmClient, eligibleTokens, caps, dataProviderV3);
  if (capMaps === null) return calls;
  const {tokenAddrsForCapped, supplyByCappedPos, eligIdxToCappedPos} = capMaps;

  for (const [eligIdx, origIdx] of eligible.entries()) {
    const token = tokenAddresses[origIdx];
    const tokenStr = token.toLowerCase();
    const cfg = configs[origIdx]!;
    const balance = balances[origIdx]!;
    const cap = caps[eligIdx];

    const cappedPos = eligIdxToCappedPos.get(eligIdx);
    const tokenAddrsEntry = cappedPos !== undefined ? tokenAddrsForCapped[cappedPos] : null;
    const currentSupply = cappedPos !== undefined ? supplyByCappedPos.get(cappedPos) ?? null : null;

    const adjustedAmount = applySupplyCapAdjustment(
      runtime,
      balance,
      tokenStr,
      cfg.decimals,
      cap,
      tokenAddrsEntry,
      currentSupply,
      'deposit'
    );
    if (adjustedAmount === null) continue;

    const adjustedUsd = calculateUsdValue(adjustedAmount, prices[origIdx], cfg.decimals);
    if (adjustedUsd < depositMinUsd) {
      runtime.log(`  Skip ${tokenStr}: deposit amount below min USD`);
      continue;
    }

    const destPool = getDestinationPool(tokenStr, config, primeTokensSet);
    const poolLabel = destPool === config.primePoolV3 ? 'prime' : 'core';
    runtime.log(`  -> Deposit ${formatUsd(adjustedUsd)} of ${tokenStr} into ${poolLabel} pool`);
    calls.push(
      encodeFunctionData({
        abi: ISteward,
        functionName: 'depositV3',
        args: [destPool, token, adjustedAmount],
      })
    );
  }

  return calls;
}
