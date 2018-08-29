pragma solidity ^0.4.24;
pragma experimental "v0.5.0";

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract Migrations is Ownable {

    uint256 public lastCompletedMigration;

    function setCompleted(uint256 completed) public onlyOwner {
        lastCompletedMigration = completed;
    }

    function upgrade(address newAddress) public onlyOwner {
        Migrations(newAddress).setCompleted(lastCompletedMigration);
    }

}
