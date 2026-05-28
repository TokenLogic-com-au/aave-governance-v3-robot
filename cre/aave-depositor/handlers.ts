import {cre, CronCapability, handler, type Runtime} from '@chainlink/cre-sdk';
import {type Config} from './types';
import {parseChainConfig, parseTokenSet} from './helpers/config';
import {DataProviderV3} from './helpers/DataProviderV3';
import {PriceOracle} from './helpers/PriceOracle';
import {buildDepositCalls} from './helpers/deposits';
import {buildMigrationCalls} from './helpers/migrations';
import {sendIntent} from './helpers/intents';

export const onCronTrigger = (runtime: Runtime<Config>): string => {
  const config = runtime.config;

  const chainConfig = parseChainConfig(config);
  if (chainConfig === null) {
    runtime.log('Invalid or missing chain configuration');
    return 'error: invalid chain configuration';
  }

  let depositMinUsd: bigint;
  let migrationMinUsd: bigint;
  let migrationBps: bigint;
  let maxBps: bigint;
  try {
    depositMinUsd = BigInt(config.depositMinUsd);
    migrationMinUsd = BigInt(config.migrationMinUsd);
    migrationBps = BigInt(config.migrationBps);
    maxBps = BigInt(config.maxBps);
  } catch {
    runtime.log('Invalid numeric config value');
    return 'error: invalid numeric configuration';
  }
  if (
    depositMinUsd < 0n ||
    migrationMinUsd < 0n ||
    migrationBps < 0n ||
    maxBps <= 0n ||
    migrationBps > maxBps
  ) {
    runtime.log('Invalid numeric config bounds');
    return 'error: invalid numeric configuration';
  }
  const ignoredTokensSet = parseTokenSet(config.ignoredTokens);
  const primeTokensSet = parseTokenSet(config.primeTokens);

  runtime.log(`── Chain ${chainConfig.chainName} | collector: ${chainConfig.collector} ──`);

  const evmClient = new cre.capabilities.EVMClient(chainConfig.chainSelector);
  const dataProviderV3 = new DataProviderV3(runtime, chainConfig.dataProviderV3, evmClient);

  const reservesResult = dataProviderV3.getAllReservesTokens();
  if (!reservesResult.ok) {
    runtime.log(`  Failed to get V3 reserves: ${reservesResult.error}`);
    return 'error: failed to fetch V3 reserves';
  }
  const reserves = reservesResult.value;
  if (reserves.length === 0) {
    runtime.log('  No reserves found');
    return 'Sent 0 intents';
  }
  runtime.log(`  Found ${reserves.length} reserves`);

  const tokenAddresses = reserves.map((reserve) => reserve.tokenAddress);

  const priceOracle = new PriceOracle(runtime, chainConfig.priceOracle, evmClient);
  const pricesResult = priceOracle.getAssetsPrices(tokenAddresses);
  if (!pricesResult.ok) {
    runtime.log(`  Failed to get prices: ${pricesResult.error}`);
    return 'error: failed to fetch prices';
  }
  const prices = pricesResult.value;

  const reserveConfigs = dataProviderV3.batchGetReserveConfigurationData(tokenAddresses);

  const depositCalls = buildDepositCalls(
    runtime,
    evmClient,
    tokenAddresses,
    prices,
    reserveConfigs,
    dataProviderV3,
    chainConfig,
    primeTokensSet,
    ignoredTokensSet,
    depositMinUsd
  );

  const migrationCalls = chainConfig.hasV2
    ? buildMigrationCalls(
        runtime,
        evmClient,
        tokenAddresses,
        prices,
        reserveConfigs,
        dataProviderV3,
        chainConfig,
        primeTokensSet,
        ignoredTokensSet,
        migrationMinUsd,
        migrationBps,
        maxBps
      )
    : [];

  const allCalls = [...depositCalls, ...migrationCalls];

  if (allCalls.length === 0) {
    runtime.log(`  No calls to execute on chain ${chainConfig.chainName}`);
    return 'Sent 0 intents';
  }

  runtime.log(
    `  Sending ${depositCalls.length} deposit(s) + ${migrationCalls.length} migration(s) on chain ${chainConfig.chainName}`
  );
  const intentResult = sendIntent(runtime, evmClient, allCalls, chainConfig.executor);
  if (!intentResult.ok) {
    runtime.log(`  Failed to send intent: ${intentResult.error}`);
    return 'error: failed to send intent';
  }
  return 'Sent 1 intents';
};

export const createHandlers = (config: Config) => {
  const trigger = new CronCapability().trigger({schedule: config.schedule});
  return [handler(trigger, onCronTrigger)];
};
