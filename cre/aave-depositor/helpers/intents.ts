import {bytesToHex, prepareReportRequest, TxStatus, type Runtime} from '@chainlink/cre-sdk';
import type {EVMClient} from '../types';
import {encodeFunctionData} from 'viem';
import {ISteward} from '../../contracts/abi/ISteward';
import type {Result} from '../types';

export function sendIntent(
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  calls: `0x${string}`[],
  executor: `0x${string}`
): Result<void> {
  try {
    const stewardData = encodeFunctionData({
      abi: ISteward,
      functionName: 'multicall',
      args: [calls],
    });

    const report = runtime.report(prepareReportRequest(stewardData)).result();

    const writeResult = evmClient
      .writeReport(runtime, {
        receiver: executor,
        report,
        gasConfig: {gasLimit: '2000000'},
      })
      .result();

    if (writeResult.txStatus !== TxStatus.SUCCESS) {
      return {
        ok: false,
        error: `Intent tx failed (status=${writeResult.txStatus}): ${
          writeResult.errorMessage ?? 'unknown error'
        }`,
      };
    }

    runtime.log(
      `  Intent sent: ${writeResult.txHash ? bytesToHex(writeResult.txHash) : 'unknown'}`
    );
    return {ok: true, value: undefined};
  } catch (error) {
    return {ok: false, error: String(error)};
  }
}
