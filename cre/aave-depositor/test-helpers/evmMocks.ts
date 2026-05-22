import {addContractMock, EvmMock, newTestRuntime, TestRuntime} from '@chainlink/cre-sdk/test';
import {type Runtime} from '@chainlink/cre-sdk';
import {IAaveDataProviderV3} from '../../contracts/abi/IAaveDataProviderV3';
import {IAavePriceOracle} from '../../contracts/abi/IAavePriceOracle';
import {IERC20} from '../../contracts/abi/IERC20';
import type {Config} from '../types';

// TestRuntime is typed as RuntimeImpl<unknown> by the SDK (no generic overload).
// This intersection preserves both Runtime<Config> (for onCronTrigger) and
// getLogs() (for assertions), confining the cast to one place.
type TypedTestRuntime = Runtime<Config> & Pick<TestRuntime, 'getLogs'>;

export function makeRuntime(config: Config): TypedTestRuntime {
  const rt = newTestRuntime();
  rt.config = config;
  return rt as unknown as TypedTestRuntime;
}

export const ADDR = {
  dataProviderV3: '0x1000000000000000000000000000000000000001' as `0x${string}`,
  dataProviderV2: '0x1000000000000000000000000000000000000002' as `0x${string}`,
  priceOracle: '0x1000000000000000000000000000000000000003' as `0x${string}`,
  collector: '0x1000000000000000000000000000000000000004' as `0x${string}`,
  executor: '0x1000000000000000000000000000000000000005' as `0x${string}`,
  steward: '0x1000000000000000000000000000000000000006' as `0x${string}`,
  corePoolV3: '0x1000000000000000000000000000000000000007' as `0x${string}`,
  corePoolV2: '0x1000000000000000000000000000000000000008' as `0x${string}`,
  usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as `0x${string}`,
  usdcATokenV3: '0x1000000000000000000000000000000000000009' as `0x${string}`,
  usdcATokenV2: '0x100000000000000000000000000000000000000a' as `0x${string}`,
};

// Standard V3 reserve config for USDC (active, not frozen, 6 decimals)
const USDC_RESERVE_CONFIG = [
  6n, // decimals
  7500n, // ltv
  8000n, // liquidationThreshold
  10500n, // liquidationBonus
  1000n, // reserveFactor
  true, // usageAsCollateralEnabled
  true, // borrowingEnabled
  false, // stableBorrowRateEnabled
  true, // isActive
  false, // isFrozen
] as const;

export function setupBaseEvmMocks(
  evmMock: EvmMock,
  collectorUsdcBalance: bigint = 1_000_000_000n, // 1000 USDC (6 decimals)
  usdcPrice: bigint = 100_000_000n, // $1 (8 decimals)
  supplyCap: bigint = 0n, // no cap
  currentV3Supply: bigint = 0n
) {
  const dpV3 = addContractMock(evmMock, {
    address: ADDR.dataProviderV3,
    abi: IAaveDataProviderV3,
  });
  dpV3.getAllReservesTokens = () => [{symbol: 'USDC', tokenAddress: ADDR.usdc}];
  dpV3.getReserveConfigurationData = () => USDC_RESERVE_CONFIG;
  dpV3.getReserveCaps = () => [0n, supplyCap]; // [borrowCap, supplyCap]
  dpV3.getReserveTokensAddresses = () => [
    ADDR.usdcATokenV3,
    '0x0000000000000000000000000000000000000000',
    '0x0000000000000000000000000000000000000000',
  ];

  const oracle = addContractMock(evmMock, {
    address: ADDR.priceOracle,
    abi: IAavePriceOracle,
  });
  oracle.getAssetsPrices = () => [usdcPrice];

  const usdc = addContractMock(evmMock, {address: ADDR.usdc, abi: IERC20});
  usdc.balanceOf = () => collectorUsdcBalance;

  // aToken totalSupply — only queried when supply cap > 0
  const usdcAToken = addContractMock(evmMock, {
    address: ADDR.usdcATokenV3,
    abi: IERC20,
  });
  usdcAToken.totalSupply = () => currentV3Supply;

  // writeReport is an EvmMock capability, not a contract call
  evmMock.writeReport = () => ({txStatus: 'TX_STATUS_SUCCESS'});

  return {dpV3, oracle, usdc, usdcAToken};
}
