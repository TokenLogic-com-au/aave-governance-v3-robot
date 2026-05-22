import {
  encodeCallMsg,
  bytesToHex,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
} from '@chainlink/cre-sdk';
import type {EVMClient} from '../types';
import {encodeFunctionData, decodeFunctionResult, zeroAddress} from 'viem';
import {IMulticall3, MULTICALL3_ADDRESS} from '../../contracts/abi/IMulticall3';
import type {Result} from '../types';

type BatchCallInput = {
  target: `0x${string}`;
  callData: `0x${string}`;
};

type BatchCallOutput = {
  success: boolean;
  returnData: `0x${string}`;
};

// aggregate3 with sequential fallback when Multicall3 is unavailable.
// Per-call failures or decode errors yield null at that index; never throws.
export function batchQuery<T>(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  calls: BatchCallInput[],
  decode: (data: `0x${string}`) => T | null,
  fallback: (index: number) => T | null
): (T | null)[] {
  if (calls.length === 0) return [];
  const batchResult = batchStaticCalls(runtime, evmClient, calls);
  if (batchResult.ok) {
    return batchResult.value.map((entry) => {
      if (!entry.success || entry.returnData === '0x') return null;
      try {
        return decode(entry.returnData);
      } catch {
        return null;
      }
    });
  }
  return calls.map((_, i) => fallback(i));
}

function batchStaticCalls(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  calls: BatchCallInput[]
): Result<BatchCallOutput[]> {
  if (calls.length === 0) return {ok: true, value: []};
  try {
    const callData = encodeFunctionData({
      abi: IMulticall3,
      functionName: 'aggregate3',
      args: [
        calls.map((call) => ({
          target: call.target,
          allowFailure: true,
          callData: call.callData,
        })),
      ],
    });
    const response = evmClient
      .callContract(runtime, {
        call: encodeCallMsg({
          from: zeroAddress,
          to: MULTICALL3_ADDRESS,
          data: callData,
        }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result();
    const decoded = decodeFunctionResult({
      abi: IMulticall3,
      functionName: 'aggregate3',
      data: bytesToHex(response.data),
    }) as readonly {success: boolean; returnData: `0x${string}`}[];
    return {ok: true, value: [...decoded]};
  } catch (error) {
    return {ok: false, error: String(error)};
  }
}
