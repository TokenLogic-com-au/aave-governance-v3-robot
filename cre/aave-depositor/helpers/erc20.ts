import {
  encodeCallMsg,
  bytesToHex,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
} from '@chainlink/cre-sdk';
import type {EVMClient} from '../types';
import {encodeFunctionData, decodeFunctionResult, zeroAddress} from 'viem';
import {IERC20} from '../../contracts/abi/IERC20';
import {batchQuery} from './multicall';

export function batchGetErc20Balances(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  tokenAddresses: `0x${string}`[],
  account: `0x${string}`
): (bigint | null)[] {
  const balanceOfCallData = encodeFunctionData({
    abi: IERC20,
    functionName: 'balanceOf',
    args: [account],
  });
  return batchQuery<bigint>(
    runtime,
    evmClient,
    tokenAddresses.map((token) => ({target: token, callData: balanceOfCallData})),
    (data) =>
      decodeFunctionResult({abi: IERC20, functionName: 'balanceOf', data}) as unknown as bigint,
    (i) => {
      try {
        const response = evmClient
          .callContract(runtime, {
            call: encodeCallMsg({
              from: zeroAddress,
              to: tokenAddresses[i],
              data: balanceOfCallData,
            }),
            blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
          })
          .result();
        return decodeFunctionResult({
          abi: IERC20,
          functionName: 'balanceOf',
          data: bytesToHex(response.data),
        }) as unknown as bigint;
      } catch {
        return null;
      }
    }
  );
}

export function batchGetTotalSupplies(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  tokenAddresses: `0x${string}`[]
): (bigint | null)[] {
  const totalSupplyCallData = encodeFunctionData({abi: IERC20, functionName: 'totalSupply'});
  return batchQuery<bigint>(
    runtime,
    evmClient,
    tokenAddresses.map((token) => ({target: token, callData: totalSupplyCallData})),
    (data) =>
      decodeFunctionResult({abi: IERC20, functionName: 'totalSupply', data}) as unknown as bigint,
    (i) => {
      try {
        const response = evmClient
          .callContract(runtime, {
            call: encodeCallMsg({
              from: zeroAddress,
              to: tokenAddresses[i],
              data: totalSupplyCallData,
            }),
            blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
          })
          .result();
        return decodeFunctionResult({
          abi: IERC20,
          functionName: 'totalSupply',
          data: bytesToHex(response.data),
        }) as unknown as bigint;
      } catch {
        return null;
      }
    }
  );
}
