import type {Runtime} from '@chainlink/cre-sdk';
import {zeroAddress} from 'viem';
import type {ReserveCaps, ReserveTokensAddresses} from './DataProviderV3';

const SUPPLY_CAP_SAFETY_BPS = 9500n;
const BPS_DENOMINATOR = 10000n;

export function applySupplyCapAdjustment(
  runtime: Runtime<unknown>,
  amount: bigint,
  tokenStr: string,
  decimals: bigint,
  caps: ReserveCaps | null,
  tokenAddresses: ReserveTokensAddresses | null,
  currentSupply: bigint | null,
  operation: 'deposit' | 'migration'
): bigint | null {
  if (!caps || caps.supplyCap === 0n) return amount;

  if (!tokenAddresses || tokenAddresses.aTokenAddress === zeroAddress) {
    runtime.log(`  Skip ${operation} ${tokenStr}: aToken address is zero`);
    return null;
  }

  if (currentSupply === null) {
    runtime.log(`  Skip ${operation} ${tokenStr}: could not fetch aToken totalSupply`);
    return null;
  }

  const normalizedCap = caps.supplyCap * 10n ** decimals;
  const rawRoom = normalizedCap > currentSupply ? normalizedCap - currentSupply : 0n;
  const roomLeft = (rawRoom * SUPPLY_CAP_SAFETY_BPS) / BPS_DENOMINATOR;

  if (roomLeft === 0n) {
    runtime.log(`  Skip ${operation} ${tokenStr}: supply cap reached (or <5% room)`);
    return null;
  }

  if (roomLeft < amount) {
    runtime.log(`  Adjusting ${tokenStr} ${operation}: ${amount} -> ${roomLeft} (supply cap 95%)`);
    return roomLeft;
  }

  return amount;
}
