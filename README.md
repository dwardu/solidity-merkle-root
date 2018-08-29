*** Work in progress ***

Gas usage of an application using on-chain Merkle-root computation
==================================================================

Mappings
--------

The standard way to implement a lookup table in Solidity is to use the native `mapping(KeyType => ValueType)` type. Mappings are used pervasively in contracts — practically every ERC-20 token contract internally keeps track of all account token balances in a mapping that maps the account address to its balance:

```solidity
mapping (address => uint256) balances;
```

Mappings are flexible in that they allow a entries to be inserted/updated one at a time, and once a value `v` has been inserted into a mapping `m` at a particular key `k`, a contract may retrieve `v` later via `m[k]`. But mappings are expensive — a Solidity `mapping` is compiled to use the `SSTORE` EVM operation, which for writing to a brand new single 32-byte location, consumes 20,000 gas. When one considers that the base EVM transaction fee is 21,000 gas, and that the block gas limit is ~8,000,000 gas, 20,000 gas is quite expensive.

Hashes to the rescue
--------------------

Suppose that we want to combine a set of `n` 32-byte hashes `h_1, h_2, … h_n` together into a single hash `R` — the simple way to do it would be to concatenate `h_1, h_2, … h_n` together into `n * 32` bytes, and then let `R` be the hash (e.g. the `keccak256`) of those bytes.

Given `R`, it would often be desirable to be able to prove that one of the original hashes, say `h_3`, was in the original set of hashes that was used to produce `R`, will give an example of why in a moment. This can be proved by presenting the complete ordered set of `n` hashes, and anyone requesting the proof should be able to verify our claim about `h_3` by confirming that the combined hash of all the hashes in the set is indeed `R` — if a good hashing function is chosen, there would be no other way to generate `R` unless `h_3` was in the set.

Suppose that we want to create a new token that has 50 tokens pre-assigned to each of a certain 1,000 addresses. But we would not like to spend 1,000 * 2,0000 = 20,000,000 gas to insert these addresses into a mapping, especially since there is a possibility that the token itself might end up being worthless, in which case it would end up being a big waste of money.

Instead we can calculate the combined hash of those 1000 addresses off-chain, and store the combined hash in the token contract. We can also publish the 1000 addresses somewhere (maybe along with the token’s source code) and any one of those 1000 addresses could claim their 50 tokens by supplying the 1000 addresses as a huge array argument to a `claimTokens` function. Internally the function would mint 10 new tokens to `msg.sender` only if it is in the supplied address array, and the combined hash of the elements of the array agrees with the hardcoded hash `R`. Note that we would still need some way to mark that the particular address has claimed its tokens, and for this we could use a mapping, which seems to defeat the point, but it actually doesn’t — the overall ether cost per address might end up being higher than if we simply used a mapping in the first place, but by using this scheme, the gas fees are shifted to the token-claiming stage, and if those 10 tokens become valuable, the gas costs to withdraw them will be negligible, whereas if those 10 tokens become worthless, nobody will bother wasting the gas to withdraw them. That’s the idea.

A Merkle tree provides a similar, but more efficient, scheme by which a number of hashes can be summarized into a single hash. Using a Merkle tree results membership proofs that are much more compact — they are shortened to length log₂(n) — and this simplifies the verification process.

Merkle trees
------------

Using a Merkle tree, the scheme described above might be written as follows:

```solidity
pragma solidity ^0.4.25;

import "openzeppelin-solidity/contracts/cryptography/MerkleProof.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

contract PreassignedToken is
  ERC20,
  ERC20Detailed("PreassignedToken", "PAT", 18) {

  /**
   * @notice The following value R is the root of a Merkle-tree
   * that has been constructed using as leaves the
   * following addresses:
   * 
   *   0x88386Fc84bA6bC95484008F6362F93160eF3e563
   *   0x717e6a320cf44b4aFAc2b0732D9fcBe2B7fa0Cf6
   *   ⋮
   *   0xC41B3BA8828b3321CA811111fA75Cd3Aa3BB5ACe
   */
  bytes32 constant R = 0x0431eeeca5c66b7f639888e6fca54717882484a136d9291424c9e8c8e09b3edf;

  mapping (address => bool) _claimed;

  function claimTokens(bytes32[] proof) external {
    require(MerkleTree.verifyProof({
      proof: proof,
      root: H,
      leaf: bytes32(msg.sender)
    }), "Liar");
    require(!_claimed[msg.sender], "Greedy");
    _claimed[msg.sender] = true;
    _mint(msg.sender, 50 * 10 ** _decimals);
  }

}
```

As simple as that! Of course, we can only write it so compactly because all the ERC-20 token functionality as well as the Merkle proof verification function come prepackaged in the OpenZeppelin library — this lets us just put things together, as it should be.

---

As an example throughout this document we will use the [Escrow](https://github.com/OpenZeppelin/openzeppelin-solidity/blob/v2.0.0-rc.1/contracts/payment/Escrow.sol) contract from the OpenZeppelin Solidity library. The contract’s interface looks like this:

```solidity
contract Escrow {
  function depositsOf(address payee) public view returns (uint256);
  function deposit(address payee) public payable;
  function withdraw(address payee) public;
}
```


Ether is deposited to a `payee` by sending it to the `deposit` function with the `payee` as the argument. Multiple deposits may be sent to the same payee, and the accumulated deposits for a payee may be pulled into the payee account by sending a transaction to `withdraw` with `payee` as the argument. Internally, the contract keeps track of all balances in a mapping:

```solidity
mapping(address => uint256) private _deposits;
```

So the first-time deposit of some non-zero amount of ether to a payee will cost at least the base transaction fee of 21000 gas + 20000 gas to write to the mapping. The base transaction fee may be offset by bulking a number of deposits in one transaction as follows:

```solidity
function bulkDeposit(address[] payees, uint256[] amounts) external payable;
```

However if internally we write a new mapping entry per payee, the cost will still increase linearly by at least 20000 gas per payee.

Explanation
-----------

The OpenZeppelin [Escrow](https://github.com/OpenZeppelin/openzeppelin-solidity/blob/v2.0.0-rc.1/contracts/payment/Escrow.sol) contract is implemented using a `mapping` to store deposits. We take it and modify it a little bit:

* We remove the restriction that it is a [Secondary](https://github.com/OpenZeppelin/openzeppelin-solidity/blob/v2.0.0-rc.1/contracts/ownership/Secondary.sol) contract that can only be accessed from the account that created it
* We add a `bulkDeposit` function that is equivalent to calling `deposit` multiple times, but is cheaper to run per individual payment because we pay the 21000 base transaction fee once

We name our modified version [EscrowUsingMapping](./contracts/EscrowUsingMapping.sol) - it has the following interface:

```solidity
contract EscrowUsingMapping {
  function depositsOf(address payee) public view returns (uint256);
  function deposit(address payee) public payable;
  function bulkDeposit(address[] payees, uint256[] amounts) external payable;
  function withdraw(address payee) public;
}
```

We give it visibility `external` so that the compiler can compile the function to read the values directly from the calldata and save some gas.

We then create a new escrow implementation called [EscrowUsingMerkle](./contracts/EscrowUsingMerkle.sol), having the following interface:

```solidity
contract EscrowUsingMerkle {
  function bulkDeposit(address[] payees, uint256[] amounts) external payable;
  function withdraw(address payee, uint256 amount, bytes32 bulkDepositId, bytes32[] proof) external;
}
```

Notice how:
* We do not implement `depositsOf`, as we no longer have access to the details of individual payments that were made as part of a bulk payment - the only thing we could do is to supply a Merkle proof to verify that a bulk-payment with a certan id (Merkle-root) truly contained an individual payment with a certain payee and amount - but we don't do it.
* We do not implement `deposit`, as this escrow implementation uses a Merkle-tree, and to construct the Merkle-tree on-chain we need to have all the information available at once.
* `bulkDeposit` has exactly the same interface
* To `withdraw`, in addition to the `payee`:
  - we need to specify the `amount`, because this is not recorded anywhere on-chain
  - we need to supply the bulk-deposit id (which is also the Merkle-root), and the Merkle-proof that `(payee, amount)` was indeed one the leaves in the tree having root `bulkDepositId`


Other
----

* If the data is larger than 32 bytes, the savings will be larger

* Internally, a `mapping` is compiled to use the `SSTORE` EVM operation, which for writing to a brand new single 32-byte location, consumes 20000 gas, which isn’t cheap.
