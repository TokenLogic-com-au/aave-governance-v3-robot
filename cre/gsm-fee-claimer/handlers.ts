import {cre, CronCapability, getNetwork, handler, type Runtime} from '@chainlink/cre-sdk';
import {zeroAddress} from 'viem';
import {type Config, type NetworkConfig} from './types';
import {processGsmFees} from './processGsmFees';

const createGsmFeesHandler = (network: NetworkConfig) => {
  return (runtime: Runtime<Config>): string => {
    runtime.log(`[${network.chainName}] Handler triggered for ${network.gsms.length} GSM(s)`);

    const networkInfo = getNetwork({
      chainFamily: 'evm',
      chainSelectorName: network.chainName,
      isTestnet: false,
    });

    if (!networkInfo) {
      runtime.log(`Network not found: ${network.chainName}`);
      return 'error: network not found';
    }

    const evmClient = new cre.capabilities.EVMClient(networkInfo.chainSelector.selector);

    const distributed = processGsmFees(
      runtime,
      evmClient,
      network.mailboxAddress,
      network.chainName,
      network.gsms.map((gsm) => gsm.address)
    );
    return distributed > 0 ? `Sent ${distributed} intents` : 'No GSM fees to distribute';
  };
};

export const createHandlers = (config: Config) => {
  const trigger = new CronCapability().trigger({schedule: config.schedule});

  return config.evms
    .filter(
      (network) =>
        network.chainName && network.mailboxAddress !== zeroAddress && network.gsms.length > 0
    )
    .map((network) => handler(trigger, createGsmFeesHandler(network)));
};
