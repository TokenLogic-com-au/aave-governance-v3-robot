import {
  encodeCallMsg,
  bytesToHex,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
} from '@chainlink/cre-sdk';
import type {EVMClient} from '../types';
import {encodeFunctionData, decodeFunctionResult, zeroAddress} from 'viem';
import {IAavePriceOracle} from '../../contracts/abi/IAavePriceOracle';
import type {Result} from '../types';

export class PriceOracle {
  constructor(
    private readonly runtime: Runtime<unknown>,
    private readonly address: `0x${string}`,
    private readonly evmClient: EVMClient
  ) {}

  getAssetsPrices(assets: `0x${string}`[]): Result<bigint[]> {
    try {
      const callData = encodeFunctionData({
        abi: IAavePriceOracle,
        functionName: 'getAssetsPrices',
        args: [assets],
      });

      const response = this.evmClient
        .callContract(this.runtime, {
          call: encodeCallMsg({
            from: zeroAddress,
            to: this.address,
            data: callData,
          }),
          blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
        })
        .result();

      const prices = decodeFunctionResult({
        abi: IAavePriceOracle,
        functionName: 'getAssetsPrices',
        data: bytesToHex(response.data),
      }) as readonly bigint[];

      return {ok: true, value: [...prices]};
    } catch (error) {
      return {ok: false, error: String(error)};
    }
  }
}
