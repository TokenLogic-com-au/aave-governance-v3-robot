// Zodiac Roles Modifier ABI
export const IRoles = [
  {
    inputs: [
      {internalType: 'address', name: 'to', type: 'address'},
      {internalType: 'uint256', name: 'value', type: 'uint256'},
      {internalType: 'bytes', name: 'data', type: 'bytes'},
      {internalType: 'uint8', name: 'operation', type: 'uint8'},
      {internalType: 'bytes32', name: 'roleKey', type: 'bytes32'},
      {internalType: 'bool', name: 'shouldRevert', type: 'bool'},
    ],
    name: 'execTransactionWithRole',
    outputs: [{internalType: 'bool', name: 'success', type: 'bool'}],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
