// Aave Steward ABI
export const ISteward = [
  {
    inputs: [
      {internalType: 'address', name: 'pool', type: 'address'},
      {internalType: 'address', name: 'reserve', type: 'address'},
      {internalType: 'uint256', name: 'amount', type: 'uint256'},
    ],
    name: 'depositV3',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {internalType: 'address', name: 'v2Pool', type: 'address'},
      {internalType: 'address', name: 'v3Pool', type: 'address'},
      {internalType: 'address', name: 'underlying', type: 'address'},
      {internalType: 'uint256', name: 'amount', type: 'uint256'},
    ],
    name: 'migrateV2toV3',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{internalType: 'bytes[]', name: 'data', type: 'bytes[]'}],
    name: 'multicall',
    outputs: [{internalType: 'bytes[]', name: 'results', type: 'bytes[]'}],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
