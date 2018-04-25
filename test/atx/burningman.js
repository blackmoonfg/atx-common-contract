const Calculator = require('../../common/helpers/calculator')
const Setup = require('../setup/setup')
const error = require('../../common/errors')

const GroupRegistration = require("../../common/atoms/accessGroupRegistration")
const BurningManService = require("../../common/atoms/burningManService")
const PoliciesService = require("../../common/atoms/policiesService")

contract('BurningMan', accounts => {

	const INT_BIG_NUMBER = 2**32

	const setup = new Setup()
	const calc = new Calculator()

	const systemOwner = accounts[0]
	const account1 = accounts[1]
	const account2 = accounts[3]
	const account3 = accounts[4]
	const moderator = accounts[5]
	const oracle = accounts[6]

	const moderatorGroupName = "Moderators Group"

	const State = {
		PREPARING: 0,
		RUNNING: 1,
		BEFORE_FINALIZATION: 2,
		FINALIZED: 3,
	}

	let token
	let groupRegistration
	let burningManService
	let policiesService

	const getBurningManConfig = async (redemptionFee = { rdFeeValue: 100, rdFeeDecimals: 3, }, exchangePrice = 99, maxAmountForBuyback = 1000, durationInDays = 5) => {
		const advantage = 100
		const duration = durationInDays*24*60*60

		return [
			token.ATxProxy.address,
			setup.moduleContext.bmcToken.address,
			token.Profiterole.address,
			(await setup.timeMachine.getCurrentTime()) + advantage,
			await setup.timeMachine.getFutureTime(advantage + duration),
			redemptionFee.rdFeeValue,
			redemptionFee.rdFeeDecimals,
			exchangePrice,
			maxAmountForBuyback,
		]
	}

	const createBurningMan = async (moderatorGroupName, moderators, limit = 1) => {
		await groupRegistration.createGroup(moderatorGroupName, moderators)

		await policiesService.addPolicyForAddingBurningMan(token.ServiceController, moderatorGroupName, limit, limit)

		const config = await getBurningManConfig()

		const [burningMan,] = await burningManService.createBurningMan(
			config,
			token.ATxProxy,
			{ user: moderators[0], group: moderatorGroupName, },
			systemOwner
		)

		return [ burningMan, config, ]
	}

	const setupDataControllerOracles = async (dataController, oracle = oracle) => {
		await token.DataController.addOracles([dataController.contract.registerHolder.getData(0x0, 0x0, 0).slice(0, 10),], [oracle,], { from: systemOwner, })
	}

	const registerHolders = async (externalAccountIds, holderAddresses, countryCode = 1) => {
		for (var idx in externalAccountIds) {
			await token.DataController.registerHolder(externalAccountIds[idx], holderAddresses[idx], countryCode)
		}
	}

	before("Before all", async () => {
		await setup.snapshot()

		await setup.beforeAll()

		token = setup.token[0]

		groupRegistration = new GroupRegistration(setup.moduleContext)
		burningManService = new BurningManService(setup.moduleContext)
		policiesService = new PoliciesService(setup.moduleContext, setup.def.TestPendingFacade)

		await setup.snapshot()
	})

	after("cleanup", async () => {
		await setup.revert(INT_BIG_NUMBER)
	})

	context("setters", () => {
		const account1ExternalId = "0xee00ff"

		let account1Balance
		let burningMan


		before(async () => {
			[burningMan,] = await createBurningMan(moderatorGroupName, [moderator,])

			await setupDataControllerOracles(token.DataController, oracle)
			await registerHolders([account1ExternalId,], [account1,])

			await setup.moduleContext.atxPlatform.massTransfer([account1,], [200,], await token.ATxProxy.smbl.call(), { from: systemOwner, })
			account1Balance = (await token.ATxProxy.balanceOf.call(account1)).toNumber()
		})

		after(async () => {
			await setup.revert()
		})

		const price = 100
		const rdFee = [ 50, 2, ]
		const otherRdFee = [ 75, 2, ]

		it("shouldn't be able to set price by non-contract owner with UNAUTHORIZED code", async () => {
			const nonOwner = account1
			assert.equal((await burningMan.setPrice.call(price, { from: nonOwner, })).toNumber(), error.UNAUTHORIZED)
		})

		it("should have `Preparing` state", async () => {
			assert.equal((await burningMan.getState.call()), State.PREPARING)
		})

		it("shouldn't be able to set price before `BeforeFinalization` period with BURNING_MAN_ERROR_WRONG_STATE code", async () => {
			assert.equal((await burningMan.setPrice.call(price, { from: systemOwner, })).toNumber(), error.BURNING_MAN_WRONG_STATE)
		})

		it("shouldn't have the same price as that is wanted to be set", async () => {
			assert.notEqual((await burningMan.price.call()).toNumber(), price)
		})

		it("shouldn't be able to set price before `BeforeFinalization` period and have the same price", async () => {
			const priceBefore = (await burningMan.price.call()).toNumber()
			await burningMan.setPrice(price, { from: systemOwner, })
			assert.equal((await burningMan.price.call()).toNumber(), priceBefore)
		})

		it("should jump in time to start period", async () => {
			await setup.timeMachine.jumpDaysForward(1)
			assert.equal((await burningMan.getState.call()), State.RUNNING)
		})

		it("should provide allowance before registering sell in a burning man", async () => {
			await token.ATxProxy.approve(burningMan.address, account1Balance, { from: account1, })
		})

		it("should be able to register sell of all balance of a user with OK code", async () => {
			assert.equal((await burningMan.registerSell.call(account1Balance, { from: account1, })), error.OK)
		})

		it("should be able to register sell of all balance of a user", async () => {
			await burningMan.registerSell(account1Balance, { from: account1, })
			assert.equal((await token.ATxProxy.balanceOf.call(account1)).toNumber(), 0)
		})

		it("should jump in time to end sell period", async () => {
			await setup.timeMachine.jumpDaysForward(10)
			assert.equal((await burningMan.getState.call()), State.BEFORE_FINALIZATION)
		})

		it("should be able to set price in `BeforeFinalization` period with OK code", async () => {
			assert.equal((await burningMan.setPrice.call(price, { from: systemOwner, })).toNumber(), error.OK)
		})

		it("should be able to set price in `BeforeFinalization` period", async () => {
			await burningMan.setPrice(price, { from: systemOwner, })
			assert.equal((await burningMan.price.call()).toNumber(), price)
		})

		it("should be able to set special Rd fee for an account in `BeforeFinalization` period with OK code", async () => {
			assert.equal((await burningMan.setSpecialRdFee.call(account1, rdFee[0], rdFee[1], { from: systemOwner, })).toNumber(), error.OK)
		})

		it("should be able to set special Rd fee for an account in `BeforeFinalization` period", async () => {
			await burningMan.setSpecialRdFee(account1, rdFee[0], rdFee[1], { from: systemOwner, })
			assert.deepEqual((await burningMan.getSpecialRdFee.call(account1)).map(v => v.toNumber()), rdFee)
		})

		it("should deposit enough ether to cover buyback", async () => {
			const etherNeeded = (await burningMan.getEstimatedToDepositEth.call()).toNumber()
			await web3.eth.sendTransaction({ from: systemOwner, to: burningMan.address, value: etherNeeded, })
			assert.equal((await web3.eth.getBalance(burningMan.address)).toNumber(), etherNeeded)
		})

		it("should deposit enough redemption fee bonus tokens to cover distribution", async () => {
			const bonusTokensNeeded = (await burningMan.getEstimatedRdFeeAmount.call()).toNumber()
			await setup.moduleContext.bmcToken.transfer(burningMan.address, bonusTokensNeeded, { from: systemOwner, })
			assert.equal((await setup.moduleContext.bmcToken.balanceOf.call(burningMan.address)).toNumber(), bonusTokensNeeded)
		})

		it("should be able to finalize buyback with OK code", async () => {
			assert.equal((await burningMan.finalizeBuyback.call({ from: systemOwner, })), error.OK)
		})

		it("should be able to finalize buyback", async () => {
			await burningMan.finalizeBuyback({ from: systemOwner, })
			assert.equal((await burningMan.getState.call()), State.FINALIZED)
		})

		it("shouldn't be able to set special Rd fee for an account after `Finalized` period with BURNING_MAN_ERROR_WRONG_STATE code", async () => {
			assert.equal((await burningMan.setSpecialRdFee.call(account1, rdFee[0], rdFee[1], { from: systemOwner, })).toNumber(), error.BURNING_MAN_WRONG_STATE)
		})

		it("shouldn't have the same Rd fee for an account as that is wanted to be set", async () => {
			const actualRdFee = await burningMan.getSpecialRdFee.call(account1)
			assert.notDeepEqual(actualRdFee.map(v => v.toNumber()), otherRdFee)
		})

		it("shouldn't be able to set special Rd fee for an account after `Finalized` period", async () => {
			const rdFeeBefore = await burningMan.getSpecialRdFee.call(account1)
			await burningMan.setSpecialRdFee(account1, otherRdFee[0], otherRdFee[1], { from: systemOwner, })
			assert.deepEqual((await burningMan.getSpecialRdFee.call(account1)), rdFeeBefore)
		})
	})

	// context("burning", () => {
	// 	it('should burn some amount of tokens', async() => {
	// 		const price = 100
	// 		const amount = 100

	// 		await token.BurningMan.setPrice(price, { from: systemOwner, })

	// 		const balanceOfBefore = (await token.ATxProxy.balanceOf.call(systemOwner)).toNumber()

	// 		await token.ATxProxy.approve(token.BurningMan.address, amount, { from: systemOwner, })

	// 		await setup.timeMachine.jumpMinuteForward(1)

	// 		let state = await token.BurningMan.getState.call()
	// 		assert.equal(state.toNumber(), states.RUNNING)

	// 		const code = await token.BurningMan.registerSell.call(amount, { from: systemOwner, })
	// 		assert.equal(code.toNumber(), OK)

	// 		await token.BurningMan.registerSell(amount, { from: systemOwner, })

	// 		const balanceOfAfter = (await token.ATxProxy.balanceOf.call(systemOwner)).toNumber()
	// 		assert.equal(balanceOfAfter, balanceOfBefore - amount)

	// 		const ethAmount = await token.BurningMan.getEstimatedToDepositEth.call()
	// 		await web3.eth.sendTransaction({ from: systemOwner, to: token.BurningMan.address, value: ethAmount, })
	// 		assert.equal(ethAmount.toNumber(), web3.eth.getBalance(token.BurningMan.address))

	// 		await setup.timeMachine.jumpYearForward(3)

	// 		state = await token.BurningMan.getState.call()
	// 		assert.equal(state, states.BEFORE_FINALIZATION)

	// 		const distributeAmount = await token.BurningMan.getEstimatedRdFeeAmount.call()
	// 		await setup.BMCProxy.transfer(token.BurningMan.address, distributeAmount, { from: systemOwner, })
	// 		assert.equal((await setup.BMCProxy.balanceOf(token.BurningMan.address)).toNumber(), distributeAmount.toNumber())

	// 		const buybackResult = await token.BurningMan.finalizeBuyback.call({ from: systemOwner, })
	// 		assert.equal(buybackResult.toNumber(), OK)

	// 		await token.BurningMan.finalizeBuyback({ from: systemOwner, })

	// 		state = await token.BurningMan.getState.call()
	// 		assert.equal(state, states.FINALIZED)

	// 		const [ rdFeeNumber, rdFeeDecimals, ] = await token.BurningMan.rdFee.call()
	// 		const eth = await token.BurningMan.getAvailableToWithdrawEth.call({ from: systemOwner, })
	// 		assert.equal(eth, calc.withoutFee(amount, rdFeeNumber, rdFeeDecimals) * price)
	// 	})

	// 	it('should revert some amount of tokens before burn', async() => {
	// 		const price = 100
	// 		const amount = 100
	// 		const halfAmount = amount / 2

	// 		await token.BurningMan.setPrice(price, { from: systemOwner, })

	// 		const balanceOfBefore = (await token.ATxProxy.balanceOf.call(systemOwner)).toNumber()

	// 		await token.ATxProxy.approve(token.BurningMan.address, amount, { from: systemOwner, })

	// 		await setup.timeMachine.jumpHourForward(2)

	// 		let code = await token.BurningMan.registerSell.call(amount, { from: systemOwner, })
	// 		assert.equal(code.toNumber(), OK)

	// 		await token.BurningMan.registerSell(amount, { from: systemOwner, })

	// 		code = await token.BurningMan.revertSell.call(amount, { from: systemOwner, })
	// 		assert.equal(code.toNumber(), OK)

	// 		await token.BurningMan.revertSell(halfAmount, { from: systemOwner, })

	// 		const balanceOfAfter = (await token.ATxProxy.balanceOf.call(systemOwner)).valueOf()
	// 		assert.equal(balanceOfAfter, balanceOfBefore - halfAmount)

	// 		const ethAmount = await token.BurningMan.getEstimatedToDepositEth.call()

	// 		await web3.eth.sendTransaction({ from: systemOwner, to: token.BurningMan.address, value: ethAmount, })
	// 		assert.equal(web3.eth.getBalance(token.BurningMan.address), ethAmount.toNumber())

	// 		await setup.timeMachine.jumpYearForward(3)

	// 		const distributeAmount = await token.BurningMan.getEstimatedRdFeeAmount.call()
	// 		await setup.BMCProxy.transfer(token.BurningMan.address, distributeAmount, { from: systemOwner, })
	// 		assert.equal((await setup.BMCProxy.balanceOf(token.BurningMan.address)).toNumber(), distributeAmount.toNumber())

	// 		const buybackResult = await token.BurningMan.finalizeBuyback.call({ from: systemOwner, })
	// 		assert.equal(buybackResult.toNumber(), OK)

	// 		await token.BurningMan.finalizeBuyback({ from: systemOwner, })

	// 		const [ rdFeeNumber, rdFeeDecimals, ] = await token.BurningMan.rdFee.call()
	// 		const eth = await token.BurningMan.getAvailableToWithdrawEth.call({ from: systemOwner, })
	// 		assert.equal(eth, calc.withoutFee(halfAmount, rdFeeNumber, rdFeeDecimals) * price)
	// 	})

	// 	it('should estimate ether amount', async() => {

	// 		const price = 100
	// 		await token.BurningMan.setPrice(price, { from: systemOwner, })

	// 		const amount = 100
	// 		await token.ATxProxy.approve(token.BurningMan.address, amount, { from: systemOwner, })
	// 		await token.ATxProxy.approve(token.BurningMan.address, amount, { from: account1, })

	// 		await setup.timeMachine.jumpHourForward(2)

	// 		await token.BurningMan.registerSell(amount, { from: systemOwner, })
	// 		await token.BurningMan.registerSell(amount, { from: account1, })

	// 		const [ rdFeeNumber, rdFeeDecimals, ] = await token.BurningMan.rdFee.call()
	// 		const firstAmount = calc.withoutFee(amount, rdFeeNumber, rdFeeDecimals) * price
	// 		const secondAmount = calc.withoutFee(amount, rdFeeNumber, rdFeeDecimals) * price

	// 		const ethAmount = await token.BurningMan.getEstimatedToDepositEth.call()
	// 		assert.equal(ethAmount.toNumber(), firstAmount + secondAmount)
	// 	})

	// 	it('should withdraw ether amount after finalize', async() => {
	// 		const amount = 100
	// 		const price = web3.toWei(1000, "gwei")

	// 		await token.BurningMan.setPrice(price, { from: systemOwner, })
	// 		await token.ATxProxy.approve(token.BurningMan.address, amount, { from: account1, })

	// 		await token.BurningMan.registerSell(amount, { from: account1, })

	// 		await token.BurningMan.setSpecialRdFee(account1, 30, 2, { from: systemOwner, })
	// 		await setup.timeMachine.jumpYearForward(3)

	// 		const ethAmount = await token.BurningMan.getEstimatedToDepositEth.call()
	// 		await web3.eth.sendTransaction({ from: systemOwner, to: token.BurningMan.address, value: ethAmount, })
	// 		assert.equal(web3.eth.getBalance(token.BurningMan.address), ethAmount.toNumber())

	// 		const distributeAmount = await token.BurningMan.getEstimatedRdFeeAmount.call()
	// 		await setup.BMCProxy.transfer(token.BurningMan.address, distributeAmount, { from: systemOwner, })
	// 		assert.equal((await setup.BMCProxy.balanceOf(token.BurningMan.address)).toNumber(), distributeAmount.toNumber())

	// 		await token.BurningMan.finalizeBuyback({ from: systemOwner, })

	// 		const etherToWithdraw = await token.BurningMan.getAvailableToWithdrawEth.call({ from: account1, })
	// 		console.log(`etherToWithdraw ${etherToWithdraw.toNumber()}`)
	// 		const withdrawResult = (await token.BurningMan.withdrawEth.call(etherToWithdraw, { from: account1, }))
	// 		assert.equal(withdrawResult.toNumber(), OK)

	// 		const beforeBalance = web3.eth.getBalance(account1)

	// 		const manualGasPrice = web3.toWei(20, "gwei")
	// 		const withdrawEthTx = await token.BurningMan.withdrawEth(etherToWithdraw, { from: account1, gasPrice: manualGasPrice, })

	// 		const withdrawCost = withdrawEthTx.receipt.gasUsed * manualGasPrice
	// 		const actualBalance = web3.eth.getBalance(account1)

	// 		const leftEther = await token.BurningMan.getAvailableToWithdrawEth.call({ from: account1, })
	// 		assert.equal(leftEther, 0)

	// 		const expectedBalance = beforeBalance.sub(withdrawCost).plus(etherToWithdraw)
	// 		assert.equal(actualBalance.toNumber(), expectedBalance.toNumber())
	// 	})
	// })
})
