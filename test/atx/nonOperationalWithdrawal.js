const utils = require('bmc-contract/common/helpers/utils')
const errorsScope = require('bmc-contract/common/errors')
const eventsHelper = require('bmc-contract/common/helpers/eventsHelper')
const Setup = require('./../setup/setup')

contract('Non Operational withdraw manager', accounts => {

	const INT_BIG_NUMBER = 2**32

	const setup = new Setup()

	const systemOwner = accounts[0]
	const account1 = accounts[1]
	const oracle = accounts[2]
	const externalAccount1Id = "0x1111ffff"

	const balances = [1000,]

	before('Before', async() => {
		await setup.snapshot()
		await setup.beforeAll()

		await setup.defToken.Withdrawal.setPendingManager(setup.TestPendingManager.address, { from: systemOwner, })

		await setup.ATxPlatform.massTransfer([account1,], balances, await setup.defToken.ATxProxy.smbl(), { from: systemOwner, })

		await setup.DataController.registerHolder(externalAccount1Id, account1, 1)
		await setup.DataController.addOracles([setup.DataController.contract.changeOperational.getData(0x0, false).slice(0, 10),], [oracle,], { from: systemOwner, })
		await setup.DataController.changeOperational(externalAccount1Id, false, { from: oracle, })

		await setup.snapshot()
	})

	after("cleanup", async () => {
		await setup.revert(INT_BIG_NUMBER)
	})

	context("transfer", () => {
		const withdrawAmount = 60
		let initialTokenOwnerBalance
		let initialBlockedAccountBalance
		let tokenOwner
		let operationBlockNumber

		before(async () => {
			tokenOwner = await setup.defToken.ATxProxy.contractOwner.call()
			initialTokenOwnerBalance = (await setup.defToken.ATxProxy.balanceOf.call(tokenOwner)).toNumber()
			initialBlockedAccountBalance = (await setup.defToken.ATxProxy.balanceOf.call(account1)).toNumber()
		})

		it("should have proper balance for account1", async () => {
		})

		it("should approve transfer for NonOperationalWithdrawalManager contract", async () => {
			await setup.defToken.ATxProxy.approve(setup.defToken.Withdrawal.address, withdrawAmount, { from: account1, })
			assert.equal(await setup.ATxPlatform.allowance.call(
				account1,
				setup.defToken.Withdrawal.address,
				await setup.defToken.ATxProxy.smbl()
			), withdrawAmount)
		})

		it("should have mark withdrawal with MULTISIG_ADDED code", async () => {
			assert.equal((await setup.defToken.Withdrawal.withdraw.call(
				withdrawAmount,
				setup.defToken.ATxProxy.address,
				0,
				{ from: account1, }
			)).toNumber(), errorsScope.MULTISIG_ADDED)
		})

		it('should be possible to approve token transfer by a moderator', async() => {
			const txHash = await setup.defToken.Withdrawal.withdraw(withdrawAmount, setup.defToken.ATxProxy.address, 0, { from: account1, })

			const events = await eventsHelper.findEvent([setup.TestPendingManager,], txHash, "ProtectionTxAdded")
			assert.lengthOf(events, 1)
			const event = events[0]
			const key = event.args.key
			operationBlockNumber = event.args.blockNumber

			await setup.TestPendingManager.accept(key, setup.def.group, { from: systemOwner, })

			assert.equal((await setup.TestPendingManager.hasConfirmedRecord.call(key)).toNumber(), errorsScope.OK)
		})

		it("should be able to withdraw from blocked account to token owner with OK code", async () => {
			assert.equal((await setup.defToken.Withdrawal.withdraw.call(
				withdrawAmount,
				setup.defToken.ATxProxy.address,
				operationBlockNumber,
				{ from: account1, }
			)).toNumber(), errorsScope.OK)

		})

		it("should be able to withdraw from blocked account to token owner", async () => {
			await setup.defToken.Withdrawal.withdraw(
				withdrawAmount,
				setup.defToken.ATxProxy.address,
				operationBlockNumber,
				{ from: account1, }
			)
			assert.equal((await setup.defToken.ATxProxy.balanceOf(account1)).toNumber(), initialBlockedAccountBalance - withdrawAmount)
		})

		it("should show that token owner received withdrawn tokens on his account", async () => {
			assert.equal((await setup.defToken.ATxProxy.balanceOf.call(tokenOwner)).toNumber(), initialTokenOwnerBalance + withdrawAmount)
		})
	})
})
