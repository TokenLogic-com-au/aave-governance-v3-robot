// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ReceiverTemplate} from '../../src/contracts/cre-receivers/ReceiverTemplate.sol';

contract MockReceiver is ReceiverTemplate {
  bytes public lastReport;

  constructor(
    address _forwarder,
    address _initialOwner
  ) ReceiverTemplate(_forwarder, _initialOwner) {}

  function _processReport(bytes calldata report) internal override {
    lastReport = report;
  }
}
