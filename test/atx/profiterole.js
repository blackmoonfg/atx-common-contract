const utils = require('bmc-contract/common/helpers/utils')
const Setup = require('../setup/setup')
const errorScope = require('../../common/errors')
const Calculator = require('../../common/helpers/calculator')

const ProfiteroleWrapper = artifacts.require('ProfiteroleWrapper')

contract('Profiterole', accounts => {

	const INT_BIG_NUMBER = 2**32

	const setup = new Setup()
	setup.init()

	const owner = accounts[0]
	const oracle = accounts[3]
	const distributionSource = accounts[5]

	let scope

	const addMessageSources = async (profiterole, oracles, distributionSources) => {
		await profiterole.addOracles(oracles, { from: owner, })
		await profiterole.addDistributionSources(distributionSources, { from: owner, })
	}

	before('Before', async() => {
		await setup.snapshot()
		await setup.beforeAll()
		scope = setup
		scope.profiteroleWrapper = await ProfiteroleWrapper.new(scope.BMCProxy.address, scope.Treasury.address, scope.ProfiteroleWallet.address, { from: owner, })

		await setup.snapshot()
	})

	after("cleanup", async () => {
		await setup.revert(INT_BIG_NUMBER)
	})

	context("basic setters", () => {
		describe("oracle", () => {
			it("wrapper exists", async () => {
				assert.isDefined(scope.profiteroleWrapper)
				assert.notEqual(scope.profiteroleWrapper.address, utils.zeroAddress)
			})

			it("could add oracle with OK code", async () => {
				assert.equal((await scope.profiteroleWrapper.addOracles.call([oracle,], { from: owner, })).toNumber(), errorScope.OK)
			})

			it("could add oracle", async () => {
				await scope.profiteroleWrapper.addOracles([oracle,], { from: owner, })
				assert.isTrue(await scope.profiteroleWrapper.testOraclePresence.call({ from: oracle, }))
			})

			it("couldn't add oracle by non-owner", async () => {
				const nonOwner = accounts[8]
				assert.equal(await scope.profiteroleWrapper.addOracles.call([oracle,], { from: nonOwner, }), errorScope.UNAUTHORIZED)
			})

			it("could remove oracle with OK code", async () => {
				await scope.profiteroleWrapper.addOracles([oracle,], { from: owner, })
				assert.equal((await scope.profiteroleWrapper.removeOracles.call([oracle,], { from: owner, })).toNumber(), errorScope.OK)
			})

			it("could remove oracle", async () => {
				await scope.profiteroleWrapper.addOracles([oracle,], { from: owner, })
				await scope.profiteroleWrapper.removeOracles([oracle,], { from: owner, })
				assert.isFalse(await scope.profiteroleWrapper.testOraclePresence.call({ from: oracle, }))
			})
		})

		describe("distribution sources", () => {
			it("could add distribution source with OK code", async () => {
				assert.equal(await scope.profiteroleWrapper.addDistributionSources.call([distributionSource,], { from: owner, }), errorScope.OK)
			})

			it("could add distribution source", async () => {
				await scope.profiteroleWrapper.addDistributionSources([distributionSource,], { from: owner, })
				assert.isTrue(await scope.profiteroleWrapper.testDistributionSourcePresence.call({ from: distributionSource, }))
			})

			it("couldn't add distribution source by non-owner", async () => {
				const nonOwner = accounts[8]
				assert.equal(await scope.profiteroleWrapper.addDistributionSources.call([distributionSource,], { from: nonOwner, }), errorScope.UNAUTHORIZED)
			})

			it("could remove distribution source with OK code", async () => {
				await scope.profiteroleWrapper.addDistributionSources([distributionSource,], { from: owner, })
				assert.equal(await scope.profiteroleWrapper.removeDistributionSources.call([distributionSource,], { from: owner, }), errorScope.OK)
			})

			it("could remove distribution source", async () => {
				await scope.profiteroleWrapper.addDistributionSources([distributionSource,], { from: owner, })
				await scope.profiteroleWrapper.removeDistributionSources([distributionSource,], { from: owner, })
				assert.isFalse(await scope.profiteroleWrapper.testDistributionSourcePresence.call({ from: distributionSource, }))
			})
		})
	})

	context("constructor", () => {
		it("should have wallet", async () => {
			assert.equal(await scope.Profiterole.wallet.call(), scope.ProfiteroleWallet.address)
		})

		it("should have treasury", async () => {
			assert.equal(await scope.Profiterole.treasury.call(), scope.Treasury.address)
		})

		it("should have bonus token", async () => {
			assert.equal(await scope.Profiterole.bonusToken.call(), scope.BMCProxy.address)
		})
	})

	context("distribution", () => {
		let treasuryVM

		it("could store a new distribution deposit", async () => {
			const deposit1 = 100
			const deposit2 = 300

			await setup.BMCProxy.transfer(distributionSource, deposit1 + deposit2, { from: owner, })
			await addMessageSources(scope.Profiterole, [oracle,], [distributionSource,])
			await setup.BMCProxy.approve(scope.Profiterole.address, deposit1 + deposit2, { from: distributionSource, })

			assert.equal((await scope.Profiterole.distributeBonuses.call(deposit1, { from: distributionSource, })).toNumber(), errorScope.OK)

			const deposit1Tx = await scope.Profiterole.distributeBonuses(deposit1, { from: distributionSource, })
			assert.equal(await setup.BMCProxy.balanceOf.call(scope.ProfiteroleWallet.address), deposit1)

			await setup.timeMachine.jumpDaysForward(6)

			const deposit2Tx = await scope.Profiterole.distributeBonuses(deposit2, { from: distributionSource, })
			assert.equal(await setup.BMCProxy.balanceOf.call(scope.ProfiteroleWallet.address), deposit1 + deposit2)

			const block1 = web3.eth.getBlock(deposit1Tx.receipt.blockNumber)
			const block2 = web3.eth.getBlock(deposit2Tx.receipt.blockNumber)
			assert.equal(await scope.Profiterole.firstDepositDate.call(), block1.timestamp)
			assert.equal(await scope.Profiterole.lastDepositDate.call(), block2.timestamp)
			assert.equal((await scope.Profiterole.distributionDeposits.call(block1.timestamp))[0], deposit1)
			assert.equal((await scope.Profiterole.distributionDeposits.call(block2.timestamp))[0], deposit2)
		})

		it("could calculate available bonuses for two distributed deposits for all time", async () => {
			const deposit1 = 1000
			const deposit2 = 1500
			const withdraw1 = 400
			const distributionAmount = 10000
			const distributionDelta = distributionAmount * 0.0001
			treasuryVM = new Calculator.treasuryConstructor()
			const user1 = web3.sha3("12")
			const user2 = web3.sha3("11")

			// simulate treasuryVM math

			const startDate = new Date()
			var depositDate = startDate
			treasuryVM.deposit(user1, deposit1, depositDate)
			depositDate = setup.timeMachine.addDays(depositDate, 1)
			treasuryVM.deposit(user2, deposit2, depositDate)
			depositDate = setup.timeMachine.addDays(depositDate, 13)
			treasuryVM.withdraw(user1, withdraw1, depositDate)
			const distributionDate = setup.timeMachine.addDays(depositDate, 16)


			// use Treasury contract

			await setup.BMCProxy.transferWithReference(oracle, deposit1, "treasury deposit", { from: owner, })
			await scope.Treasury.addOracles([oracle,], { from: owner, })
			await setup.BMCProxy.approve(scope.Treasury.address, deposit1, { from: oracle, })
			await scope.Treasury.deposit(user1, deposit1, 0, 0x0, 0, { from: oracle, })

			await setup.timeMachine.jumpDaysForward(1)

			await setup.BMCProxy.transferWithReference(oracle, deposit2, "treasury deposit", { from: owner, })
			await scope.Treasury.addOracles([oracle,], { from: owner, })
			await setup.BMCProxy.approve(scope.Treasury.address, deposit2, { from: oracle, })
			await scope.Treasury.deposit(user2, deposit2, 0, 0x0, 0, { from: oracle, })

			await setup.timeMachine.jumpDaysForward(13)

			await scope.Treasury.withdraw(user1, withdraw1, owner, 0x0, 0, { from: oracle, })

			await setup.timeMachine.jumpDaysForward(16)

			// distribute bonuses

			await addMessageSources(scope.Profiterole, [oracle,], [distributionSource,])

			await setup.BMCProxy.transferWithReference(distributionSource, distributionAmount, "distribution", { from: owner, })
			await setup.BMCProxy.approve(scope.Profiterole.address, distributionAmount, { from: distributionSource, })
			await scope.Profiterole.distributeBonuses(distributionAmount, { from: distributionSource, })

			const availableBonusesForUser1 = (await scope.Profiterole.getTotalBonusesAmountAvailable.call(user1, { from: oracle, })).toNumber()
			const availableBonusesForUser2 = (await scope.Profiterole.getTotalBonusesAmountAvailable.call(user2, { from: oracle, })).toNumber()

			assert.approximately(availableBonusesForUser1, distributionAmount * treasuryVM.getUserSharesPercentForDate(user1, distributionDate), distributionDelta)
			assert.approximately(availableBonusesForUser2, distributionAmount * treasuryVM.getUserSharesPercentForDate(user2, distributionDate), distributionDelta)
		})

		it("couldn't withdraw more bonuses than available", async () => {
			const deposit1 = 1000
			const deposit2 = 1400
			const distributionAmount = 15000
			const distributionDelta = distributionAmount * 0.0001
			treasuryVM = new Calculator.treasuryConstructor()
			const user1 = web3.sha3("12")
			const user2 = web3.sha3("11")
			const addressToWithdraw = owner

			// simulate treasuryVM math

			const startDate = new Date()
			var depositDate = startDate
			treasuryVM.deposit(user1, deposit1, depositDate)
			depositDate = setup.timeMachine.addDays(depositDate, 1)
			treasuryVM.deposit(user2, deposit2, depositDate)
			const distributionDate = setup.timeMachine.addDays(depositDate, 10)

			// use Treasury contract

			await setup.BMCProxy.transferWithReference(oracle, deposit1, "treasury deposit", { from: owner, })
			await scope.Treasury.addOracles([oracle,], { from: owner, })
			await setup.BMCProxy.approve(scope.Treasury.address, deposit1, { from: oracle, })
			await scope.Treasury.deposit(user1, deposit1, 0, 0x0, 0, { from: oracle, })

			await setup.timeMachine.jumpDaysForward(1)

			await setup.BMCProxy.transferWithReference(oracle, deposit2, "treasury deposit", { from: owner, })
			await scope.Treasury.addOracles([oracle,], { from: owner, })
			await setup.BMCProxy.approve(scope.Treasury.address, deposit2, { from: oracle, })
			await scope.Treasury.deposit(user2, deposit2, 0, 0x0, 0, { from: oracle, })

			await setup.timeMachine.jumpDaysForward(10)


			// distribute bonuses

			await addMessageSources(scope.Profiterole, [oracle,], [distributionSource,])

			await setup.BMCProxy.transferWithReference(distributionSource, distributionAmount, "distribution", { from: owner, })
			await setup.BMCProxy.approve(scope.Profiterole.address, distributionAmount, { from: distributionSource, })
			await scope.Profiterole.distributeBonuses(distributionAmount, { from: distributionSource, })

			const availableBonusesForUser1 = (await scope.Profiterole.getTotalBonusesAmountAvailable.call(user1, { from: oracle, })).toNumber()
			const availableBonusesForUser2 = (await scope.Profiterole.getTotalBonusesAmountAvailable.call(user2, { from: oracle, })).toNumber()

			assert.approximately(availableBonusesForUser1, distributionAmount * treasuryVM.getUserSharesPercentForDate(user1, distributionDate), distributionDelta)
			assert.approximately(availableBonusesForUser2, distributionAmount * treasuryVM.getUserSharesPercentForDate(user2, distributionDate), distributionDelta)

			const moreThanAvalableForUser1 = availableBonusesForUser1 + 100
			try {
				assert.equal(await scope.Profiterole.withdrawBonuses.call(user1, moreThanAvalableForUser1, addressToWithdraw, 0, 0x0, { from: oracle, }), errorScope.PROFITEROLE_INSUFFICIENT_BALANCE_TO_WITHDRAW)
				assert.isTrue(false)
			}
			catch (e) {
				utils.ensureRevert(e)
			}

			const moreThanAvalableForUser2 = availableBonusesForUser2 + 50
			try {
				assert.equal(await scope.Profiterole.withdrawBonuses.call(user2, moreThanAvalableForUser2, addressToWithdraw, 0, 0x0, { from: oracle, }), errorScope.PROFITEROLE_INSUFFICIENT_BALANCE_TO_WITHDRAW)
				assert.isTrue(false)
			}
			catch (e) {
				utils.ensureRevert(e)
			}
		})

		it("could be able to withdraw available bonuses", async () => {
			const deposit1 = 1000
			const deposit2 = 1400
			const distributionAmount = 15000
			const distributionDelta = distributionAmount * 0.0001
			treasuryVM = new Calculator.treasuryConstructor()
			const user1 = web3.sha3("12")
			const user2 = web3.sha3("11")
			const addressToWithdraw = owner

			// simulate treasuryVM math

			const startDate = new Date()
			var depositDate = startDate
			treasuryVM.deposit(user1, deposit1, depositDate)
			depositDate = setup.timeMachine.addDays(depositDate, 1)
			treasuryVM.deposit(user2, deposit2, depositDate)
			const distributionDate = setup.timeMachine.addDays(depositDate, 10)

			// use Treasury contract

			await setup.BMCProxy.transferWithReference(oracle, deposit1, "treasury deposit", { from: owner, })
			await scope.Treasury.addOracles([oracle,], { from: owner, })
			await setup.BMCProxy.approve(scope.Treasury.address, deposit1, { from: oracle, })
			await scope.Treasury.deposit(user1, deposit1, 0, 0x0, 0, { from: oracle, })

			await setup.timeMachine.jumpDaysForward(1)

			await setup.BMCProxy.transferWithReference(oracle, deposit2, "treasury deposit", { from: owner, })
			await scope.Treasury.addOracles([oracle,], { from: owner, })
			await setup.BMCProxy.approve(scope.Treasury.address, deposit2, { from: oracle, })
			await scope.Treasury.deposit(user2, deposit2, 0, 0x0, 0, { from: oracle, })

			await setup.timeMachine.jumpDaysForward(10)


			// distribute bonuses

			await addMessageSources(scope.Profiterole, [oracle,], [distributionSource,])

			await setup.BMCProxy.transferWithReference(distributionSource, distributionAmount, "distribution", { from: owner, })
			await setup.BMCProxy.approve(scope.Profiterole.address, distributionAmount, { from: distributionSource, })
			await scope.Profiterole.distributeBonuses(distributionAmount, { from: distributionSource, })

			const availableBonusesForUser1 = (await scope.Profiterole.getTotalBonusesAmountAvailable.call(user1, { from: oracle, })).toNumber()
			const availableBonusesForUser2 = (await scope.Profiterole.getTotalBonusesAmountAvailable.call(user2, { from: oracle, })).toNumber()

			assert.approximately(availableBonusesForUser1, distributionAmount * treasuryVM.getUserSharesPercentForDate(user1, distributionDate), distributionDelta)
			assert.approximately(availableBonusesForUser2, distributionAmount * treasuryVM.getUserSharesPercentForDate(user2, distributionDate), distributionDelta)

			// user 1 withdraw

			const bonusRemainderForUser1 = 100
			const lessThanAvalableForUser1 = availableBonusesForUser1 - bonusRemainderForUser1
			assert.equal(await scope.Profiterole.withdrawBonuses.call(user1, lessThanAvalableForUser1, addressToWithdraw, 0, 0x0, { from: oracle, }), errorScope.OK)

			const balanceOfWithdrawDestination = (await setup.BMCProxy.balanceOf.call(addressToWithdraw)).toNumber()
			await scope.Profiterole.withdrawBonuses(user1, lessThanAvalableForUser1, addressToWithdraw, 0, 0x0, { from: oracle, })
			assert.approximately((await scope.Profiterole.getTotalBonusesAmountAvailable.call(user1, { from: oracle, })).toNumber(), bonusRemainderForUser1, distributionDelta)

			assert.approximately((await setup.BMCProxy.balanceOf.call(addressToWithdraw)).toNumber(), balanceOfWithdrawDestination + lessThanAvalableForUser1, distributionDelta)

			await scope.Profiterole.withdrawBonuses(user1, bonusRemainderForUser1, addressToWithdraw, 0, 0x0, { from: oracle, })
			assert.approximately((await scope.Profiterole.getTotalBonusesAmountAvailable.call(user1, { from: oracle, })).toNumber(), 0, distributionDelta)

			// user 2 withdraw

			const bonusRemainderForUser2 = 50
			const lessThanAvalableForUser2 = availableBonusesForUser2 - bonusRemainderForUser2
			assert.equal(await scope.Profiterole.withdrawBonuses.call(user2, lessThanAvalableForUser2, addressToWithdraw, 0, 0x0, { from: oracle, }), errorScope.OK)

			const balanceOfWithdrawDestination2 = (await setup.BMCProxy.balanceOf.call(addressToWithdraw)).toNumber()
			await scope.Profiterole.withdrawBonuses(user2, lessThanAvalableForUser2, addressToWithdraw, 0, 0x0, { from: oracle, })
			assert.approximately((await scope.Profiterole.getTotalBonusesAmountAvailable.call(user2, { from: oracle, })).toNumber(), bonusRemainderForUser2, distributionDelta)
			assert.approximately((await setup.BMCProxy.balanceOf.call(addressToWithdraw)).toNumber(), balanceOfWithdrawDestination2 + lessThanAvalableForUser2, distributionDelta)

			await scope.Profiterole.withdrawBonuses(user2, bonusRemainderForUser2, addressToWithdraw, 0, 0x0, { from: oracle, })
			assert.approximately((await scope.Profiterole.getTotalBonusesAmountAvailable.call(user2, { from: oracle, })).toNumber(), 0, distributionDelta)
		})
	})

	context("high-load", () => {
		describe("many periods - rare bonus withdrawals", async () => {

		})

		describe("many periods - often bonus withdrawals", async () => {

		})
	})
})
