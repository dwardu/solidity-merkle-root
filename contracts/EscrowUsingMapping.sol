pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title Escrow
 * @dev Base escrow contract, holds funds destinated to a payee until they
 * withdraw them. The contract that uses the escrow as its amount method
 * should be its primary, and provide public methods redirecting to the escrow's
 * deposit and withdraw.
 */
contract EscrowUsingMapping {

    using SafeMath for uint256;

    event Deposited(address indexed payee, uint256 weiAmount);
    event Withdrawn(address indexed payee, uint256 weiAmount);

    mapping(address => uint256) private _deposits;

    function depositsOf(address payee) external view returns (uint256) {
        return _deposits[payee];
    }

    /**
     * @dev Stores the sent amount as credit to be withdrawn.
     * @param payee The destination address of the funds.
     */
    function deposit(address payee) external payable {
        uint256 amount = msg.value;
        _deposits[payee] = _deposits[payee].add(amount);

        emit Deposited(payee, amount);
    }

    function bulkDeposit(address[] payees, uint256[] amounts) external payable {
        require(payees.length == amounts.length, "payees.length != amounts.length");
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < payees.length; i++) {
            address payee = payees[i];
            uint256 amount = amounts[i];
            _deposits[payee] = _deposits[payee].add(amount);
            emit Deposited(payee, amount);
            totalAmount = totalAmount.add(amount);
        }
        require(totalAmount == msg.value, "totalAmount != msg.value");
    }

    /**
     * @dev Withdraw accumulated balance for a payee.
     * @param payee The address whose funds will be withdrawn and transferred to.
     */
    function withdraw(address payee) external {
        uint256 amount = _deposits[payee];
        assert(address(this).balance >= amount);

        _deposits[payee] = 0;

        payee.transfer(amount);

        emit Withdrawn(payee, amount);
    }

}
