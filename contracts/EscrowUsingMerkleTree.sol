pragma solidity ^0.4.24;
pragma experimental "v0.5.0";

import "openzeppelin-solidity/contracts/cryptography/MerkleTree.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";


contract EscrowUsingMerkleTree {

    using SafeMath for uint256;

    event Deposited(address indexed payee, uint256 weiAmount);
    event Withdrawn(address indexed payee, uint256 weiAmount);

    struct BulkDepositInfo {
        bool wasBulkDepositMade;
        mapping (address => bool) wasIndividualPaymentWithdrawn;
    }

    /// @dev This is not really necessary, as we use the Merkle-root as the
    /// id, which we can reconstruct from the other logs.
    event BulkDepositMade(bytes32 bulkDepositId);

    mapping (bytes32 => BulkDepositInfo) private _bulkDepositInfos;

    function bulkDeposit(address[] payees, uint256[] amounts) external payable {
        uint256 n = payees.length;
        require(amounts.length == n);

        bytes32[] memory individualPaymentIds = new bytes32[](payees.length);

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < n; i++) {
            address payee = payees[i];
            uint256 amount = amounts[i];
            individualPaymentIds[i] = keccak256(abi.encodePacked(payee, amount));
            emit Deposited(payee, amount);
            totalAmount = totalAmount.add(amount);
        }

        require(totalAmount == msg.value, "totalAmount != msg.value");

        // We use the Merkle root as the id
        bytes32 bulkDepositId = MerkleTree.computeRoot(individualPaymentIds);

        BulkDepositInfo storage bulkDepositInfo = _bulkDepositInfos[bulkDepositId];
        require(!bulkDepositInfo.wasBulkDepositMade);
        bulkDepositInfo.wasBulkDepositMade = true;

        emit BulkDepositMade(bulkDepositId);
    }

    /**
     * @param bulkDepositId This is the root of the Merkle-tree with leaf_i being
     * keccak256(payee_ileaves being
     * the keccak256()
     * @param proof (Merkle) proof that the bulk-deposit with id `bulkDepositId`
     * truly contained an individual deposit of `amount` wei to `payee` account.
     */
    function withdraw(
        address payee,
        uint256 amount,
        bytes32 bulkDepositId,
        bytes32[] proof
    ) external {
        assert(address(this).balance >= amount);

        BulkDepositInfo storage bulkDepositInfo = _bulkDepositInfos[bulkDepositId];
        require(bulkDepositInfo.wasBulkDepositMade);
        require(!bulkDepositInfo.wasIndividualPaymentWithdrawn[payee]);

        bytes32 leaf = keccak256(abi.encodePacked(payee, amount));
        require(MerkleTree.verifyProof({
            proof: proof,
            root: bulkDepositId,
            leaf: leaf
        }));

        bulkDepositInfo.wasIndividualPaymentWithdrawn[payee] = true;
        payee.transfer(amount);

        emit Withdrawn(payee, amount);
    }

}
