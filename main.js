const assert = require('assert')
const fs = require('fs')

const {
  utils: { toWei, soliditySha3, toBN },
  eth: { getAccounts }
} = web3

const {
  buildMerkleTree,
  arrayUtils: { zip }
} = require('openzeppelin-solidity/test/helpers/merkleTree')

const { numberSum, bnSum, count, toHex, wrapJsonRpcProvider } = require('./utils')

const EscrowUsingMapping = artifacts.require('EscrowUsingMapping')
const EscrowUsingMerkleTree = artifacts.require('EscrowUsingMerkleTree')

const { evmSnapshot, evmRevert } = wrapJsonRpcProvider(web3.currentProvider)

module.exports = async done => {
  try {
    const [account0] = await getAccounts()

    const tsvFile = fs.createWriteStream('data_opt200runs_temp.tsv')
    tsvFile.write(
      `${[
        'n',
        'Mapping.deposit',
        'Mapping.bulkDeposit',
        'Merkle.bulkDeposit',
        'Mapping.withdraw',
        'Merkle.withdraw'
      ].join('\t')}\n`
    )

    const contractMapping = await EscrowUsingMapping.deployed()
    const contractMerkle = await EscrowUsingMerkleTree.deployed()

    const testEstimateMappingDeposit = async (payees, amounts) =>
      numberSum(
        await Promise.all(
          zip(payees, amounts).map(([payee, amount]) =>
            contractMapping.deposit.estimateGas(payee, { value: amount })
          )
        )
      )

    const testExecuteMappingBulkDeposit = async (payees, amounts) => {
      const {
        receipt: { gasUsed }
      } = await contractMapping.bulkDeposit(payees, amounts, {
        value: bnSum(amounts)
      })
      return gasUsed
    }

    const testEstimateMappingWithdraw = async payees =>
      numberSum(await Promise.all(payees.map(payee => contractMapping.withdraw.estimateGas(payee))))

    const testExecuteMerkleBulkDeposit = async (payees, amounts) => {
      const {
        logs,
        receipt: { gasUsed }
      } = await contractMerkle.bulkDeposit(payees, amounts, {
        value: bnSum(amounts)
      })
      return { gasUsed, logs }
    }

    const testEstimateMerkleWithdraw = async (payees, amounts, bulkDepositTxLogs) => {
      // Reconstruct Merkle-tree from logs
      const individualDepositLogs = bulkDepositTxLogs
        .filter(({ event }) => event === 'Deposited')
        .map(({ args }) => args)
      const individualPaymentIds = individualDepositLogs.map(({ payee, weiAmount }) =>
        soliditySha3({ t: 'address', v: payee }, { t: 'uint256', v: weiAmount })
      )
      const { root, proofs } = buildMerkleTree(individualPaymentIds)

      // This event log is not necessary, but we put it
      const [{ bulkDepositId }] = bulkDepositTxLogs
        .filter(({ event }) => event === 'BulkDepositMade')
        .map(({ args }) => args)
      assert(bulkDepositId === root)

      return numberSum(
        await Promise.all(
          zip(payees, amounts, proofs).map(([payee, amount, proof]) =>
            contractMerkle.withdraw.estimateGas(payee, amount, bulkDepositId, proof)
          )
        )
      )
    }

    for (const n of [...count(1, 64), ...count(64, 128, 16), ...count(128, 256, 32), 256, 384]) {
      console.log(`n = ${n}`)

      // For some strange reason, address 0x01 and 0x07 (and maybe others?)
      // cause msg.transfer to fail, so we start from 10000. Seems like a
      // ganache-cli bug.
      const payees = count(10000, 10000 + n).map(toHex(20))

      // Just in case...
      assert(payees.every(payee => payee.toLowerCase() !== account0.toLowerCase()))

      const amounts = count(0, n).map(i => toWei(toBN(10 + i), 'finney'))

      const { result: snapshot1 } = await evmSnapshot()

      const gasMappingDeposit = await testEstimateMappingDeposit(payees, amounts)
      const gasMappingBulkDeposit = await testExecuteMappingBulkDeposit(payees, amounts)
      const gasMappingWithdraw = await testEstimateMappingWithdraw(payees)

      const { gasUsed: gasMerkleBulkDeposit, logs } = await testExecuteMerkleBulkDeposit(
        payees,
        amounts
      )

      const gasMerkleWithdraw = await testEstimateMerkleWithdraw(payees, amounts, logs)

      await evmRevert(snapshot1)

      const cols = [
        n,
        gasMappingDeposit,
        gasMappingBulkDeposit,
        gasMerkleBulkDeposit,
        gasMappingWithdraw,
        gasMerkleWithdraw
      ]
      tsvFile.write(`${cols.map(col => col.toString()).join('\t')}\n`)
    }
  } catch (error) {
    console.error({ error })
  } finally {
    try {
      fs.close()
    } finally {
      done()
    }
  }
}
