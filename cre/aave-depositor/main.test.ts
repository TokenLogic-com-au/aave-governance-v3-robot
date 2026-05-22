import {describe, expect} from 'bun:test';
import {addContractMock, EvmMock, test} from '@chainlink/cre-sdk/test';
import {getNetwork} from '@chainlink/cre-sdk';
import {onCronTrigger, createHandlers} from './handlers';
import {type Config} from './types';
import {IAaveDataProviderV2} from '../contracts/abi/IAaveDataProviderV2';
import {IERC20} from '../contracts/abi/IERC20';
import {ADDR, setupBaseEvmMocks, makeRuntime} from './test-helpers/evmMocks';

const MAINNET_SELECTOR = getNetwork({
  chainFamily: 'evm',
  chainSelectorName: 'ethereum-mainnet',
  isTestnet: false,
})!.chainSelector.selector;

const BASE_CONFIG: Config = {
  schedule: '0 * * * * *',
  chainName: 'ethereum-mainnet',
  executor: ADDR.executor,
  steward: ADDR.steward,
  dataProviderV3: ADDR.dataProviderV3,
  collector: ADDR.collector,
  priceOracle: ADDR.priceOracle,
  corePoolV3: ADDR.corePoolV3,
  depositMinUsd: '100000000', // $1 with 8 decimals
  migrationMinUsd: '100000000',
  migrationBps: '1000', // 10%
  maxBps: '10000',
  ignoredTokens: [],
  primeTokens: [],
};

describe('createHandlers', () => {
  test('returns one handler with the configured cron schedule', () => {
    const handlers = createHandlers(BASE_CONFIG);
    expect(handlers).toHaveLength(1);

    const trigger = handlers[0].trigger as unknown as {
      config: {schedule: string};
    };
    expect(trigger.config.schedule).toBe(BASE_CONFIG.schedule);
  });
});

describe('onCronTrigger — deposits', () => {
  test('sends 1 deposit intent when collector has sufficient USDC balance', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock);

    const runtime = makeRuntime(BASE_CONFIG);
    const result = onCronTrigger(runtime);

    expect(result).toBe('Sent 1 intents');
    expect(runtime.getLogs()).toContain(
      '  Sending 1 deposit(s) + 0 migration(s) on chain ethereum-mainnet'
    );
  });

  test('skips deposit when USD value is below depositMinUsd', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock, 500_000n);

    const runtime = makeRuntime(BASE_CONFIG);
    const result = onCronTrigger(runtime);

    expect(result).toBe('Sent 0 intents');
  });

  test('skips deposit when collector balance is zero', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock, 0n);

    const runtime = makeRuntime(BASE_CONFIG);
    const result = onCronTrigger(runtime);

    expect(result).toBe('Sent 0 intents');
  });

  test('skips token when it is in the ignored list', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock);

    const runtime = makeRuntime({...BASE_CONFIG, ignoredTokens: [ADDR.usdc]});
    const result = onCronTrigger(runtime);

    expect(result).toBe('Sent 0 intents');
  });

  test('adjusts deposit amount when V3 supply cap has limited room (95% buffer)', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock, 1_000_000_000n, 100_000_000n, 500n, 0n);

    const runtime = makeRuntime(BASE_CONFIG);
    const result = onCronTrigger(runtime);

    expect(result).toBe('Sent 1 intents');
    expect(runtime.getLogs().join('\n')).toContain('Adjusting');
  });

  test('skips deposit when V3 supply cap is fully reached', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock, 1_000_000_000n, 100_000_000n, 100n, 100_000_000n);

    const runtime = makeRuntime(BASE_CONFIG);
    const result = onCronTrigger(runtime);

    expect(result).toBe('Sent 0 intents');
    expect(runtime.getLogs().join('\n')).toContain('supply cap reached');
  });
});

describe('onCronTrigger — migrations', () => {
  const V2_CONFIG: Config = {
    ...BASE_CONFIG,
    dataProviderV2: ADDR.dataProviderV2,
    corePoolV2: ADDR.corePoolV2,
  };

  test('sends 1 migration intent when collector has V2 aTokens', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock, 0n);

    const dpV2 = addContractMock(evmMock, {
      address: ADDR.dataProviderV2,
      abi: IAaveDataProviderV2,
    });
    dpV2.getReserveTokensAddresses = () => [
      ADDR.usdcATokenV2,
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000',
    ];
    dpV2.getReserveData = () => [5_000_000_000n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0];

    const usdcATokenV2 = addContractMock(evmMock, {
      address: ADDR.usdcATokenV2,
      abi: IERC20,
    });
    usdcATokenV2.balanceOf = () => 1_000_000_000n;

    const runtime = makeRuntime(V2_CONFIG);
    const result = onCronTrigger(runtime);

    expect(result).toBe('Sent 1 intents');
    expect(runtime.getLogs().join('\n')).toContain('-> Migrate');
  });

  test('skips migration when V2 aToken balance is zero', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock, 0n);

    const dpV2 = addContractMock(evmMock, {
      address: ADDR.dataProviderV2,
      abi: IAaveDataProviderV2,
    });
    dpV2.getReserveTokensAddresses = () => [
      ADDR.usdcATokenV2,
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000',
    ];
    dpV2.getReserveData = () => [5_000_000_000n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0];

    const usdcATokenV2 = addContractMock(evmMock, {
      address: ADDR.usdcATokenV2,
      abi: IERC20,
    });
    usdcATokenV2.balanceOf = () => 0n;

    const runtime = makeRuntime(V2_CONFIG);
    expect(onCronTrigger(runtime)).toBe('Sent 0 intents');
  });

  test('caps migration amount by V2 available liquidity', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock, 0n);

    const dpV2 = addContractMock(evmMock, {
      address: ADDR.dataProviderV2,
      abi: IAaveDataProviderV2,
    });
    dpV2.getReserveTokensAddresses = () => [
      ADDR.usdcATokenV2,
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000',
    ];
    dpV2.getReserveData = () => [50_000_000n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0];

    const usdcATokenV2 = addContractMock(evmMock, {
      address: ADDR.usdcATokenV2,
      abi: IERC20,
    });
    usdcATokenV2.balanceOf = () => 1_000_000_000n;

    const runtime = makeRuntime({
      ...V2_CONFIG,
      migrationMinUsd: '1000000000',
    });
    expect(onCronTrigger(runtime)).toBe('Sent 0 intents');
  });

  test('skips migration when no V2 configured', () => {
    const evmMock = EvmMock.testInstance(MAINNET_SELECTOR);
    setupBaseEvmMocks(evmMock, 0n);

    const runtime = makeRuntime(BASE_CONFIG);
    expect(onCronTrigger(runtime)).toBe('Sent 0 intents');
  });
});

describe('onCronTrigger — config validation', () => {
  test('returns error when chainName is unknown', () => {
    const runtime = makeRuntime({
      ...BASE_CONFIG,
      chainName: 'not-a-real-chain',
    });
    expect(onCronTrigger(runtime)).toBe('error: invalid chain configuration');
  });
});
