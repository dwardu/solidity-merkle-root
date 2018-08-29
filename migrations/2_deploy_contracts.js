const EscrowUsingMapping = artifacts.require('EscrowUsingMapping')
const EscrowUsingMerkleTree = artifacts.require('EscrowUsingMerkleTree')

module.exports = async function(deployer) {
  await deployer.deploy(EscrowUsingMapping)
  await deployer.deploy(EscrowUsingMerkleTree)
}
