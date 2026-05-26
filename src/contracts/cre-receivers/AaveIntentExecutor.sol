// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ReceiverTemplate} from './ReceiverTemplate.sol';
import {IRoles} from '../../interfaces/IRoles.sol';

/// @notice CRE IReceiver that forwards the report (ABI-encoded Steward.multicall
///         calldata) through a Zodiac Roles Modifier into the Aave Steward.
/// @dev After deployment the owner must call setExpectedWorkflowId(workflowId)
///      to restrict acceptance to the trusted CRE workflow.
contract AaveIntentExecutor is ReceiverTemplate {
  address public immutable ROLES;
  address public immutable STEWARD;
  bytes32 public immutable ROLE_KEY;

  error ZeroAddress();

  constructor(
    address _forwarder,
    address _roles,
    address _steward,
    bytes32 _roleKey,
    address _initialOwner
  ) ReceiverTemplate(_forwarder, _initialOwner) {
    if (_roles == address(0) || _steward == address(0)) revert ZeroAddress();
    ROLES = _roles;
    STEWARD = _steward;
    ROLE_KEY = _roleKey;
  }

  function _processReport(bytes calldata report) internal override {
    IRoles(ROLES).execTransactionWithRole(STEWARD, 0, report, 0, ROLE_KEY, true);
  }
}
