import {
  bytesToHex,
  encodeCallMsg,
  hexToBase64,
  LAST_FINALIZED_BLOCK_NUMBER,
  TxStatus,
  type Runtime,
} from '@chainlink/cre-sdk';
import {
  encodeFunctionData,
  decodeFunctionResult,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
} from 'viem';
import {IGsm} from '../contracts/abi/IGsm';
import {IMailboxCRE} from '../contracts/abi/IMailboxCRE';
import {type EVMClient} from './types';

const GET_ACCRUED_FEES_CALLDATA = encodeFunctionData({abi: IGsm, functionName: 'getAccruedFees'});
const DISTRIBUTE_FEES_CALLDATA = encodeFunctionData({
  abi: IGsm,
  functionName: 'distributeFeesToTreasury',
});
const ADDRESS_BYTES_ABI = parseAbiParameters('address, bytes');

// Returns the number of GSMs for which fees were successfully distributed.
export const processGsmFees = (
  runtime: Runtime<unknown>,
  evmClient: EVMClient,
  mailboxAddress: `0x${string}`,
  chainName: string,
  gsmAddresses: `0x${string}`[]
): number => {
  let distributed = 0;

  for (const gsmAddress of gsmAddresses) {
    try {
      const response = evmClient
        .callContract(runtime, {
          call: encodeCallMsg({
            from: zeroAddress,
            to: gsmAddress,
            data: GET_ACCRUED_FEES_CALLDATA,
          }),
          blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
        })
        .result();
      const data = bytesToHex(response.data);
      if (data === '0x') {
        runtime.log(`[${chainName}] getAccruedFees(${gsmAddress}): empty response, skipping`);
        continue;
      }
      const fees = decodeFunctionResult({
        abi: IGsm,
        functionName: 'getAccruedFees',
        data,
      }) as bigint;
      runtime.log(`[${chainName}] getAccruedFees(${gsmAddress}): ${fees}`);
      if (fees === 0n) continue;
    } catch (error) {
      runtime.log(`[${chainName}] getAccruedFees(${gsmAddress}) failed: ${error}`);
      continue;
    }

    // distributeFeesToTreasury is permissionless — forward via MailboxCRE directly.
    const mailboxPayload = encodeAbiParameters(ADDRESS_BYTES_ABI, [
      gsmAddress,
      DISTRIBUTE_FEES_CALLDATA,
    ]);
    const onReportCalldata = encodeFunctionData({
      abi: IMailboxCRE,
      functionName: 'onReport',
      args: ['0x', mailboxPayload],
    });

    try {
      const estimateGasResult = evmClient
        .estimateGas(runtime, {
          msg: encodeCallMsg({
            from: zeroAddress,
            to: mailboxAddress,
            data: onReportCalldata,
          }),
        })
        .result();
      runtime.log(
        `[${chainName}] estimated gas for ${gsmAddress}: ${estimateGasResult.gas.toString()}`
      );
    } catch (error) {
      runtime.log(`[${chainName}] gas estimation failed for ${gsmAddress}: ${error}`);
      continue;
    }

    const reportResponse = runtime
      .report({
        encodedPayload: hexToBase64(mailboxPayload),
        encoderName: 'evm',
        signingAlgo: 'ecdsa',
        hashingAlgo: 'keccak256',
      })
      .result();

    const writeResult = evmClient
      .writeReport(runtime, {
        receiver: mailboxAddress,
        report: reportResponse,
        gasConfig: {gasLimit: '300000'},
      })
      .result();

    if (writeResult.txStatus !== TxStatus.SUCCESS) {
      runtime.log(
        `[${chainName}] writeReport failed for ${gsmAddress} (status=${writeResult.txStatus}): ${
          writeResult.errorMessage ?? 'unknown error'
        }`
      );
      continue;
    }

    const txHash = writeResult.txHash ? bytesToHex(writeResult.txHash) : 'unknown';
    runtime.log(`[${chainName}] distributed fees for ${gsmAddress}: ${txHash}`);
    distributed++;
  }

  return distributed;
};
