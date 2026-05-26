import {
  encodeCallMsg,
  bytesToHex,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
} from '@chainlink/cre-sdk';
import type {EVMClient} from '../types';
import {encodeFunctionData, decodeFunctionResult, zeroAddress} from 'viem';
import type {DataProviderV3, ReserveConfigData} from './DataProviderV3';
import {IAaveDataProviderV2} from '../../contracts/abi/IAaveDataProviderV2';
import {ISteward} from '../../contracts/abi/ISteward';
import {applySupplyCapAdjustment} from './caps';
import {batchGetErc20Balances} from './erc20';
import {calculateUsdValue, formatUsd} from './usdValue';
import {getDestinationPool} from './pools';
import type {ChainConfig} from './config';
import {batchQuery} from './multicall';
import {buildCapSupplyMaps} from './capMaps';

function batchGetV2ATokenAddresses(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  dataProviderV2: `0x${string}`,
  assets: `0x${string}`[]
): (`0x${string}` | null)[] {
  return batchQuery<`0x${string}`>(
    runtime,
    evmClient,
    assets.map((asset) => ({
      target: dataProviderV2,
      callData: encodeFunctionData({
        abi: IAaveDataProviderV2,
        functionName: 'getReserveTokensAddresses',
        args: [asset],
      }),
    })),
    (data) => {
      const [aTokenAddress] = decodeFunctionResult({
        abi: IAaveDataProviderV2,
        functionName: 'getReserveTokensAddresses',
        data,
      }) as unknown as [`0x${string}`, `0x${string}`, `0x${string}`];
      return aTokenAddress === zeroAddress ? null : aTokenAddress;
    },
    (idx) => {
      try {
        const callData = encodeFunctionData({
          abi: IAaveDataProviderV2,
          functionName: 'getReserveTokensAddresses',
          args: [assets[idx]],
        });
        const response = evmClient
          .callContract(runtime, {
            call: encodeCallMsg({from: zeroAddress, to: dataProviderV2, data: callData}),
            blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
          })
          .result();
        const [aTokenAddress] = decodeFunctionResult({
          abi: IAaveDataProviderV2,
          functionName: 'getReserveTokensAddresses',
          data: bytesToHex(response.data),
        }) as unknown as [`0x${string}`, `0x${string}`, `0x${string}`];
        return aTokenAddress === zeroAddress ? null : aTokenAddress;
      } catch {
        return null;
      }
    }
  );
}

function batchGetV2Liquidity(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  dataProviderV2: `0x${string}`,
  assets: `0x${string}`[]
): (bigint | null)[] {
  return batchQuery<bigint>(
    runtime,
    evmClient,
    assets.map((asset) => ({
      target: dataProviderV2,
      callData: encodeFunctionData({
        abi: IAaveDataProviderV2,
        functionName: 'getReserveData',
        args: [asset],
      }),
    })),
    (data) => {
      const [availableLiquidity] = decodeFunctionResult({
        abi: IAaveDataProviderV2,
        functionName: 'getReserveData',
        data,
      }) as unknown as [bigint, ...unknown[]];
      return availableLiquidity;
    },
    (idx) => {
      try {
        const callData = encodeFunctionData({
          abi: IAaveDataProviderV2,
          functionName: 'getReserveData',
          args: [assets[idx]],
        });
        const response = evmClient
          .callContract(runtime, {
            call: encodeCallMsg({from: zeroAddress, to: dataProviderV2, data: callData}),
            blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
          })
          .result();
        const [availableLiquidity] = decodeFunctionResult({
          abi: IAaveDataProviderV2,
          functionName: 'getReserveData',
          data: bytesToHex(response.data),
        }) as unknown as [bigint, ...unknown[]];
        return availableLiquidity;
      } catch {
        return null;
      }
    }
  );
}

export function buildMigrationCalls(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  tokenAddresses: `0x${string}`[],
  prices: bigint[],
  configs: (ReserveConfigData | null)[],
  dataProviderV3: DataProviderV3,
  config: ChainConfig,
  primeTokensSet: Set<string>,
  ignoredTokensSet: Set<string>,
  migrationMinUsd: bigint,
  migrationBps: bigint,
  maxBps: bigint
): `0x${string}`[] {
  if (!config.hasV2) return [];

  const dp2 = config.dataProviderV2 as `0x${string}`;
  const calls: `0x${string}`[] = [];

  const v2ATokens = batchGetV2ATokenAddresses(runtime, evmClient, dp2, tokenAddresses);

  const v2ATokensForBatch = v2ATokens.map((aTokenAddr) => aTokenAddr ?? zeroAddress);
  const v2Balances = batchGetErc20Balances(runtime, evmClient, v2ATokensForBatch, config.collector);

  const eligible: number[] = [];
  for (const [i, token] of tokenAddresses.entries()) {
    const tokenStr = token.toLowerCase();
    if (ignoredTokensSet.has(tokenStr)) continue;
    const cfg = configs[i];
    if (!cfg || !cfg.isActive || cfg.isFrozen) continue;
    if (!v2ATokens[i]) continue;
    const balance = v2Balances[i];
    if (!balance) continue;
    eligible.push(i);
  }

  if (eligible.length === 0) return calls;

  const eligibleTokens = eligible.map((i) => tokenAddresses[i]);
  const liquidity = batchGetV2Liquidity(runtime, evmClient, dp2, eligibleTokens);
  const caps = dataProviderV3.batchGetReserveCaps(eligibleTokens);

  const {tokenAddrsForCapped, supplyByCappedPos, eligIdxToCappedPos} = buildCapSupplyMaps(
    runtime,
    evmClient,
    eligibleTokens,
    caps,
    dataProviderV3
  );

  for (const [eligIdx, origIdx] of eligible.entries()) {
    const token = tokenAddresses[origIdx];
    const tokenStr = token.toLowerCase();
    const cfg = configs[origIdx]!;
    const aBalance = v2Balances[origIdx]!;
    const availableLiquidity = liquidity[eligIdx];
    const cap = caps[eligIdx];

    if (availableLiquidity === null) continue;

    const rawAmount = aBalance < availableLiquidity ? aBalance : availableLiquidity;
    if (rawAmount === 0n) continue;

    const adjustedAmount = (rawAmount * migrationBps) / maxBps;
    if (adjustedAmount === 0n) continue;

    const usdValue = calculateUsdValue(adjustedAmount, prices[origIdx], cfg.decimals);
    if (usdValue < migrationMinUsd) continue;

    const cappedPos = eligIdxToCappedPos.get(eligIdx);
    const tokenAddrsEntry = cappedPos !== undefined ? tokenAddrsForCapped[cappedPos] : null;
    const currentSupply = cappedPos !== undefined ? supplyByCappedPos.get(cappedPos) ?? null : null;

    const finalAmount = applySupplyCapAdjustment(
      runtime,
      adjustedAmount,
      tokenStr,
      cfg.decimals,
      cap,
      tokenAddrsEntry,
      currentSupply,
      'migration'
    );
    if (finalAmount === null) continue;

    const finalUsd = calculateUsdValue(finalAmount, prices[origIdx], cfg.decimals);
    if (finalUsd < migrationMinUsd) {
      runtime.log(`  Skip ${tokenStr}: migration amount below min USD`);
      continue;
    }

    const destPool = getDestinationPool(tokenStr, config, primeTokensSet);
    const poolLabel = destPool === config.primePoolV3 ? 'prime' : 'core';
    runtime.log(`  -> Migrate ${formatUsd(finalUsd)} of ${tokenStr} V2 -> V3 ${poolLabel} pool`);
    calls.push(
      encodeFunctionData({
        abi: ISteward,
        functionName: 'migrateV2toV3',
        args: [config.corePoolV2 as `0x${string}`, destPool, token, finalAmount],
      })
    );
  }

  return calls;
}
