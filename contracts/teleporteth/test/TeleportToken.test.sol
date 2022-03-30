// SPDX-License-Identifier: MIT
pragma solidity >=0.4.25 <0.9.0;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/TeleportToken.sol";

contract TestTeleportToken {

  function testInitialBalanceUsingDeployedContract() public {
    TeleportToken tel = TeleportToken(DeployedAddresses.TeleportToken());

    // tel.transfer(, tokens);

    uint expected = 10000000000 * 10**uint(4);

    Assert.equal(tel.balanceOf(address(0)), expected, "Owner should have 10000000000 Token initially");
  }

}
