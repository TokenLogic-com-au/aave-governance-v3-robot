import {
  encodeCallMsg,
  bytesToHex,
  LAST_FINALIZED_BLOCK_NUMBER,
  type Runtime,
} from '@chainlink/cre-sdk';
import type {EVMClient} from '../types';
import {encodeFunctionData, decodeFunctionResult, zeroAddress} from 'viem';
import {IAaveDataProviderV3} from '../../contracts/abi/IAaveDataProviderV3';
import type {Result} from '../types';
import {batchQuery} from './multicall';

type ReserveToken = {
  symbol: string;
  tokenAddress: `0x${string}`;
};

export type ReserveConfigData = {
  decimals: bigint;
  ltv: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint;
  reserveFactor: bigint;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
  stableBorrowRateEnabled: boolean;
  isActive: boolean;
  isFrozen: boolean;
};

export type ReserveCaps = {
  borrowCap: bigint;
  supplyCap: bigint;
};

export type ReserveTokensAddresses = {
  aTokenAddress: `0x${string}`;
  stableDebtTokenAddress: `0x${string}`;
  variableDebtTokenAddress: `0x${string}`;
};

export class DataProviderV3 {
  constructor(
    private readonly runtime: Runtime<unknown>,
    private readonly address: `0x${string}`,
    private readonly evmClient: EVMClient
  ) {}

  private call(callData: `0x${string}`): Result<`0x${string}`> {
    try {
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
      return {ok: true, value: bytesToHex(response.data)};
    } catch (error) {
      return {ok: false, error: String(error)};
    }
  }

  getAllReservesTokens(): Result<ReserveToken[]> {
    const res = this.call(
      encodeFunctionData({abi: IAaveDataProviderV3, functionName: 'getAllReservesTokens'})
    );
    if (!res.ok) return res;
    try {
      const decoded = decodeFunctionResult({
        abi: IAaveDataProviderV3,
        functionName: 'getAllReservesTokens',
        data: res.value,
      }) as unknown as ReserveToken[];
      return {ok: true, value: decoded};
    } catch (error) {
      return {ok: false, error: String(error)};
    }
  }

  getReserveConfigurationData(asset: `0x${string}`): Result<ReserveConfigData> {
    const res = this.call(
      encodeFunctionData({
        abi: IAaveDataProviderV3,
        functionName: 'getReserveConfigurationData',
        args: [asset],
      })
    );
    if (!res.ok) return res;
    try {
      const decoded = decodeFunctionResult({
        abi: IAaveDataProviderV3,
        functionName: 'getReserveConfigurationData',
        data: res.value,
      }) as unknown as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        boolean,
        boolean,
        boolean,
        boolean,
        boolean
      ];
      return {
        ok: true,
        value: {
          decimals: decoded[0],
          ltv: decoded[1],
          liquidationThreshold: decoded[2],
          liquidationBonus: decoded[3],
          reserveFactor: decoded[4],
          usageAsCollateralEnabled: decoded[5],
          borrowingEnabled: decoded[6],
          stableBorrowRateEnabled: decoded[7],
          isActive: decoded[8],
          isFrozen: decoded[9],
        },
      };
    } catch (error) {
      return {ok: false, error: String(error)};
    }
  }

  getReserveCaps(asset: `0x${string}`): Result<ReserveCaps> {
    const res = this.call(
      encodeFunctionData({
        abi: IAaveDataProviderV3,
        functionName: 'getReserveCaps',
        args: [asset],
      })
    );
    if (!res.ok) return res;
    try {
      const decoded = decodeFunctionResult({
        abi: IAaveDataProviderV3,
        functionName: 'getReserveCaps',
        data: res.value,
      }) as unknown as [bigint, bigint];
      return {ok: true, value: {borrowCap: decoded[0], supplyCap: decoded[1]}};
    } catch (error) {
      return {ok: false, error: String(error)};
    }
  }

  getReserveTokensAddresses(asset: `0x${string}`): Result<ReserveTokensAddresses> {
    const res = this.call(
      encodeFunctionData({
        abi: IAaveDataProviderV3,
        functionName: 'getReserveTokensAddresses',
        args: [asset],
      })
    );
    if (!res.ok) return res;
    try {
      const decoded = decodeFunctionResult({
        abi: IAaveDataProviderV3,
        functionName: 'getReserveTokensAddresses',
        data: res.value,
      }) as unknown as [`0x${string}`, `0x${string}`, `0x${string}`];
      return {
        ok: true,
        value: {
          aTokenAddress: decoded[0],
          stableDebtTokenAddress: decoded[1],
          variableDebtTokenAddress: decoded[2],
        },
      };
    } catch (error) {
      return {ok: false, error: String(error)};
    }
  }

  batchGetReserveConfigurationData(assets: `0x${string}`[]): (ReserveConfigData | null)[] {
    return batchQuery<ReserveConfigData>(
      this.runtime,
      this.evmClient,
      assets.map((asset) => ({
        target: this.address,
        callData: encodeFunctionData({
          abi: IAaveDataProviderV3,
          functionName: 'getReserveConfigurationData',
          args: [asset],
        }),
      })),
      (data) => {
        const decoded = decodeFunctionResult({
          abi: IAaveDataProviderV3,
          functionName: 'getReserveConfigurationData',
          data,
        }) as unknown as [
          bigint,
          bigint,
          bigint,
          bigint,
          bigint,
          boolean,
          boolean,
          boolean,
          boolean,
          boolean
        ];
        return {
          decimals: decoded[0],
          ltv: decoded[1],
          liquidationThreshold: decoded[2],
          liquidationBonus: decoded[3],
          reserveFactor: decoded[4],
          usageAsCollateralEnabled: decoded[5],
          borrowingEnabled: decoded[6],
          stableBorrowRateEnabled: decoded[7],
          isActive: decoded[8],
          isFrozen: decoded[9],
        };
      },
      (i) => {
        const res = this.getReserveConfigurationData(assets[i]);
        return res.ok ? res.value : null;
      }
    );
  }

  batchGetReserveCaps(assets: `0x${string}`[]): (ReserveCaps | null)[] {
    return batchQuery<ReserveCaps>(
      this.runtime,
      this.evmClient,
      assets.map((asset) => ({
        target: this.address,
        callData: encodeFunctionData({
          abi: IAaveDataProviderV3,
          functionName: 'getReserveCaps',
          args: [asset],
        }),
      })),
      (data) => {
        const decoded = decodeFunctionResult({
          abi: IAaveDataProviderV3,
          functionName: 'getReserveCaps',
          data,
        }) as unknown as [bigint, bigint];
        return {borrowCap: decoded[0], supplyCap: decoded[1]};
      },
      (i) => {
        const res = this.getReserveCaps(assets[i]);
        return res.ok ? res.value : null;
      }
    );
  }

  batchGetReserveTokensAddresses(assets: `0x${string}`[]): (ReserveTokensAddresses | null)[] {
    return batchQuery<ReserveTokensAddresses>(
      this.runtime,
      this.evmClient,
      assets.map((asset) => ({
        target: this.address,
        callData: encodeFunctionData({
          abi: IAaveDataProviderV3,
          functionName: 'getReserveTokensAddresses',
          args: [asset],
        }),
      })),
      (data) => {
        const decoded = decodeFunctionResult({
          abi: IAaveDataProviderV3,
          functionName: 'getReserveTokensAddresses',
          data,
        }) as unknown as [`0x${string}`, `0x${string}`, `0x${string}`];
        return {
          aTokenAddress: decoded[0],
          stableDebtTokenAddress: decoded[1],
          variableDebtTokenAddress: decoded[2],
        };
      },
      (i) => {
        const res = this.getReserveTokensAddresses(assets[i]);
        return res.ok ? res.value : null;
      }
    );
  }
}
