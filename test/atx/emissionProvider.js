const EmissionProvider = artifacts.require('EmissionProvider')

const utils = require('bmc-contract/common/helpers/utils.js')
const eventsHelper = require('bmc-contract/common/helpers/eventsHelper.js')
const error = require("../../common/errors.js")
const Setup = require('./../setup/setup.js')

const GroupRegistration = require("../../common/atoms/accessGroupRegistration")
const EmissionProviderService = require("../../common/atoms/emissionProviderService")
const PoliciesService = require("../../common/atoms/policiesService")

contract('EmissionProvider', accounts => {
	const setup = new Setup()
	const INT_BIG_VALUE = 2**32

	const systemOwner = accounts[0]
	const account1 = accounts[1]
	const account2 = accounts[2]
	const account3 = accounts[7]
	const moderator = accounts[3]
	const oracle = accounts[4]

	const moderatorGroupName = "Moderator Group"

	const State = {
		Init: 0, Waiting: 1, Sale: 2, Reached: 3, Destructed: 4,
	}

	let existedToken
	let groupRegistration
	let emissionProviderService
	let policiesService

	const getEmissionProviderConfig = async (softcapValue = 1000, hardcapValue = 2000, durationInDays = 5) => {
		const advantage = 100
		const duration = durationInDays*24*60*60
		return [
			existedToken.ATxProxy.address,
			setup.moduleContext.bmcToken.address,
			existedToken.Profiterole.address,
			(await setup.timeMachine.getCurrentTime()) + advantage,
			await setup.timeMachine.getFutureTime(advantage + duration),
			softcapValue,
			hardcapValue,
		]
	}

	const createEmissionProvider = async (moderatorGroupName, moderators, limit = 1) => {
		await groupRegistration.createGroup(moderatorGroupName, moderators)
		
		await policiesService.addPolicyForAddingEmissionProvider(existedToken.ServiceController, moderatorGroupName, limit, limit)
		
		const config = await getEmissionProviderConfig()
		const [emissionProvider,] = await emissionProviderService.createEmissionProvider(
			config,
			existedToken.ATxProxy,
			{ user: moderators[0], group: moderatorGroupName, },
			systemOwner
		)

		return [ emissionProvider, config, ]
	}

	before('setup', async () => {
		await setup.snapshot()

		await setup.beforeAll()

		existedToken = setup.token[0]

		groupRegistration = new GroupRegistration(setup.moduleContext)
		emissionProviderService = new EmissionProviderService(setup.moduleContext)
		policiesService = new PoliciesService(setup.moduleContext, setup.def.TestPendingFacade)

		await setup.snapshot()
	})

	after("clear", async () => {
		await setup.revert(INT_BIG_VALUE)
	})

	context("creation", () => {
		const zeroValue = 0
		const hardcapValue = 1000
		const softcapValue = 1000
		const duration = 10000
		var startDate
		var endDate

		const paramsSet = [
			async () => [ utils.zeroAddress, setup.def.BMCProxy.address, existedToken.Profiterole.address, await startDate(), await endDate(), softcapValue, hardcapValue, ],
			async () => [ existedToken.ATxProxy.address, utils.zeroAddress, existedToken.Profiterole.address, await startDate(), await endDate(), softcapValue, hardcapValue, ],
			async () => [ existedToken.ATxProxy.address, setup.def.BMCProxy.address, utils.zeroAddress, await startDate(), await endDate(), softcapValue, hardcapValue, ],
			async () => [ existedToken.ATxProxy.address, setup.ATxProxy.address, existedToken.Profiterole.address, await startDate(), await endDate(), softcapValue, hardcapValue, ],
			async () => [ existedToken.ATxProxy.address, setup.def.BMCProxy.address, existedToken.Profiterole.address, await startDate(), zeroValue, softcapValue, hardcapValue, ],
			async () => [ existedToken.ATxProxy.address, setup.def.BMCProxy.address, existedToken.Profiterole.address, zeroValue, await endDate(), softcapValue, hardcapValue, ],
			async () => [ existedToken.ATxProxy.address, setup.def.BMCProxy.address, existedToken.Profiterole.address, await startDate(), await endDate(), zeroValue, hardcapValue, ],
			async () => [ existedToken.ATxProxy.address, setup.def.BMCProxy.address, existedToken.Profiterole.address, await startDate(), await endDate(), softcapValue, zeroValue, ],
		]

		for (var params of paramsSet) {
			const getParams = params

			it("should revert while creating", async () => {
				startDate = async () => await setup.timeMachine.getCurrentTime()
				endDate = async () => await setup.timeMachine.getFutureTime(duration)
				await test.apply(this, getParams())
			})
		}

		async function test(token, bonusToken, profiterole, startDate, endDate, softcapValue, hardcapValue) {
			try {
				await EmissionProvider.new(token, bonusToken, profiterole, startDate, endDate, softcapValue, hardcapValue)
				assert(false, "exception hasn't been thrown")
			}
			catch (e) {
				utils.ensureRevert(e)
			}
		}
	})

	context("pre-sale", () => {
		let emissionProvider

		before(async () => {
			[emissionProvider,] = await createEmissionProvider(moderatorGroupName, [moderator,])
		})

		after(async () => {
			await setup.revert()
		})

		it("should have no token balance after creation", async () => {
			assert.equal(await existedToken.ATxProxy.balanceOf.call(emissionProvider.address), 0)
		})

		it("should not be possible to init not by contract owner with UNAUTHORIZED code", async () => {
			const nonOwner = accounts[1]
			assert.equal(await emissionProvider.init.call({ from: nonOwner, }), error.UNAUTHORIZED)
		})

		it("should be possible to init not initialized emission provider with OK error code", async () => {
			assert.equal(await emissionProvider.init.call({ from: systemOwner, }), error.OK)
		})

		it("should have 'Init' state before initialization", async () => {
			const [state,] = await emissionProvider.getState.call()
			assert.equal(state, State.Init)
		})

		it ("should be possible to init not initialized emission provider", async () => {
			await emissionProvider.init({ from: systemOwner, })
		})

		it("should have `Waiting` state after initialization and before start date", async () => {
			const [state,] = await emissionProvider.getState.call()
			assert.equal(state, State.Waiting)
		})

		it("should have `Sale` state after starting date", async () => {
			await setup.timeMachine.jumpDaysForward(1)
			const [ , state, ] = await emissionProvider.getState.call()
			assert.equal(state.toNumber(), State.Sale)
		})

		it("should have softcap token balance on emissionProvider address", async () => {
			assert.equal((await existedToken.ATxProxy.balanceOf.call(emissionProvider.address)).toNumber(), (await emissionProvider.tokenSoftcap.call()).toNumber())
		})
	})

	context("softcap sale", () => {
		let emissionProvider
		const cap = {
			softcap: undefined,
			hardcap: undefined,
		}

		before(async () => {
			[emissionProvider,] = await createEmissionProvider(moderatorGroupName, [moderator,])
			await emissionProvider.addOracles([oracle,], { from: systemOwner, })

			cap.softcap = (await emissionProvider.tokenSoftcap.call()).toNumber()
			cap.hardcap = (await emissionProvider.tokenHardcap.call()).toNumber()
		})

		after(async () => {
			await setup.revert()
		})

		it("shouldn't have account1 in users' whitelist", async () => {
			assert.isFalse(await emissionProvider.whitelist.call(account1))
		})

		it("shouldn't be possible to add users to whitelist before initialization with EMISSION_PROVIDER_WRONG_STATE code", async () => {
			assert.equal((await emissionProvider.addUsers.call([account1,], { from: systemOwner, })).toNumber(), error.EMISSION_PROVIDER_WRONG_STATE)
		})

		it("shouldn't be possible to add users to whitelist before initialization", async () => {
			await emissionProvider.addUsers([account1,], { from: systemOwner, })
			assert.isFalse(await emissionProvider.whitelist.call(account1))
		})

		it("should be possible to init provider", async () => {
			await emissionProvider.init({ from: systemOwner, })
			const [state,] = await emissionProvider.getState.call()
			assert.equal(state, State.Waiting)
		})

		it("should go to `Sale` period with timeMachine", async () => {
			await setup.timeMachine.jumpDaysForward(1)
		})

		it("should be possible to add user to whitelist in `Sale` state with OK code", async () => {
			assert.equal(await emissionProvider.addUsers.call([account1,], { from: systemOwner, }), error.OK)
		})

		it("should be possible to add user to whitelist in `Sale` state", async () => {
			await emissionProvider.addUsers([account1,], { from: systemOwner, })
			assert.isTrue(await emissionProvider.whitelist.call(account1))
		})

		it("should not have account1 as a holder", async () => {
			assert.isFalse(await existedToken.DataController.isRegisteredAddress.call(account1))
		})

		it("should REVERT on issuing softcapped tokens to unregistered user (not holder)", async () => {
			try {
				const resultCode = await emissionProvider.issueSoftcapToken(existedToken.ATxProxy.address, account1, cap.softcap, { from: oracle, })
				assert(false, `should throw but have code "${resultCode}"`)
			}
			catch (e) {
				utils.ensureRevert(e)
			}
		})

		const account1ExternalId = "0xee00ff"
		const countryCode = 2

		it("should be possible to register user as a holder", async () => {
			await existedToken.DataController.registerHolder(account1ExternalId, account1, countryCode)
			assert.isTrue(await existedToken.DataController.isRegisteredAddress.call(account1))
		})

		it("account1 should have no balance", async () => {
			assert.equal((await existedToken.ATxProxy.balanceOf.call(account1)).toNumber(), 0)
		})

		it("should have softcap balance on emission provider address", async () => {
			assert.equal((await existedToken.ATxProxy.balanceOf.call(emissionProvider.address)).toNumber(), cap.softcap)
		})

		it("should be possible to issue softcapped tokens to registered user (a holder) with OK code", async () => {
			try {
				assert.equal((await emissionProvider.issueSoftcapToken.call(existedToken.ATxProxy.address, account1, cap.softcap, { from: oracle, })).toNumber(), error.OK)
			}
			catch (e) {
				assert(false, `shouldn't throw ${e}`)
			}
		})

		it("should be possible to issue softcapped tokens to registered user (a holder)", async () => {
			const balanceBefore = (await existedToken.ATxProxy.balanceOf.call(emissionProvider.address)).toNumber()
			await emissionProvider.issueSoftcapToken(existedToken.ATxProxy.address, account1, cap.softcap, { from: oracle, })
			assert.equal((await existedToken.ATxProxy.balanceOf.call(emissionProvider.address)).toNumber(), balanceBefore - cap.softcap)
		})

		it("account1 should have issued tokens on his balance", async () => {
			assert.equal((await existedToken.ATxProxy.balanceOf.call(account1)).toNumber(), cap.softcap)
		})

		it("should have `Reached` after reaching softcap issuing", async () => {
			const [ hardcapState, softcapState, ] = await emissionProvider.getState.call()
			assert.equal(softcapState, State.Reached)
			assert.equal(hardcapState, State.Sale)
		})

		it("shouldn't be possible to issue softcap after reaching limit with EMISSION_PROVIDER_WRONG_STATE code", async () => {
			assert.equal((await emissionProvider.issueSoftcapToken.call(existedToken.ATxProxy.address, account1, cap.softcap, { from: oracle, })).toNumber(), error.EMISSION_PROVIDER_WRONG_STATE)
		})

		it("shouldn't be possible to issue softcap after reaching a limit", async () => {
			const balanceBefore = (await existedToken.ATxProxy.balanceOf.call(account1)).toNumber()
			await emissionProvider.issueSoftcapToken(existedToken.ATxProxy.address, account1, cap.softcap, { from: oracle, })
			assert.equal((await existedToken.ATxProxy.balanceOf.call(account1)).toNumber(), balanceBefore)
		})

		it("should not be possible to finish hardcap manually by non-contract owner with UNAUTHORIZED code", async () => {
			const nonOwner = account1
			assert.equal((await emissionProvider.finishHardcap.call({ from: nonOwner, })).toNumber(), error.UNAUTHORIZED)
		})

		it("should not be possible to finish hardcap manually by non-contract owner", async () => {
			const nonOwner = account1

			await emissionProvider.finishHardcap({ from: nonOwner, })

			const [hardcapState,] = await emissionProvider.getState.call()
			assert.equal(hardcapState, State.Sale)
		})

		it("should be possible to finish hardcap manually by contract owner in `Sale` hardcap state with OK code", async () => {
			assert.equal((await emissionProvider.finishHardcap.call({ from: systemOwner, })).toNumber(), error.OK)
		})

		it("should be possible to finish hardcap manually by contract owner in `Sale` hardcap state", async () => {
			await emissionProvider.finishHardcap({ from: systemOwner, })

			const [hardcapState,] = await emissionProvider.getState.call()
			assert.equal(hardcapState, State.Reached)
		})
	})

	context("hardcap sale", () => {
		let emissionProvider
		const cap = {
			softcap: undefined,
			hardcap: undefined,
		}

		const account1ExternalId = "0xee00ff"
		const account2ExternalId = "0xaa00dd"
		const account3ExternalId = "0xbb00cc"
		const countryCode = 2

		before(async () => {
			[emissionProvider,] = await createEmissionProvider(moderatorGroupName, [moderator,])
			await emissionProvider.addOracles([oracle,], { from: systemOwner, })

			cap.softcap = (await emissionProvider.tokenSoftcap.call()).toNumber()
			cap.hardcap = (await emissionProvider.tokenHardcap.call()).toNumber()

			await existedToken.DataController.registerHolder(account1ExternalId, account1, countryCode)
			await existedToken.DataController.registerHolder(account2ExternalId, account2, countryCode)
			await existedToken.DataController.registerHolder(account3ExternalId, account3, countryCode)

			await emissionProvider.init({ from: systemOwner, })
			await setup.timeMachine.jumpDaysForward(1)
			await emissionProvider.addUsers([ account1, account2, ], { from: systemOwner, })
		})

		after(async () => {
			await setup.revert()
		})

		let firstHardcapTransferValue
		let secondHardcapTransferValue
		let softcapBalance

		it("account2 should not have any balance", async () => {
			assert.equal(await existedToken.ATxProxy.balanceOf.call(account2), 0)
		})

		it("should have softcap balance on emission provider address", async () => {
			softcapBalance = (await existedToken.ATxProxy.balanceOf.call(emissionProvider.address)).toNumber()
			assert.equal(softcapBalance, cap.softcap)
		})

		it("should be possible to issue hardcap value to account2 with OK code", async () => {
			const hardcapValue = cap.hardcap - cap.softcap
			firstHardcapTransferValue = Math.floor(hardcapValue / 3)
			secondHardcapTransferValue = hardcapValue - firstHardcapTransferValue

			try {
				assert.equal((await emissionProvider.issueHardcapToken.call(existedToken.ATxProxy.address, account2, firstHardcapTransferValue, { from: oracle, })).toNumber(), error.OK)
			}
			catch (e) {
				assert(false, `shouldn't do revert ${e}`)
			}
		})

		it("should be possible to issue hardcap value to account2", async () => {
			await emissionProvider.issueHardcapToken(existedToken.ATxProxy.address, account2, firstHardcapTransferValue, { from: oracle, })
		})

		it("should still have `Sale` state of hardcap process", async () => {
			const [state,] = await emissionProvider.getState.call()
			assert.equal(state, State.Sale)
		})

		it("should have issued amount on account2 balance", async () => {
			assert.equal(await existedToken.ATxProxy.balanceOf.call(account2), firstHardcapTransferValue)
		})

		it("should not have to change softcap balance of emission provider when issuing hardcapping", async () => {
			assert.equal((await existedToken.ATxProxy.balanceOf.call(emissionProvider.address)).toNumber(), softcapBalance)
		})

		let notWhitelistedAccount

		it("should not be able to issue hardcap tokens to a not whitelisted user with UNAUTHORIZED code", async () => {
			notWhitelistedAccount = account3
			assert.equal((await emissionProvider.issueHardcapToken.call(existedToken.ATxProxy.address, notWhitelistedAccount, secondHardcapTransferValue, { from: oracle, })).toNumber(), error.UNAUTHORIZED)
		})

		it("should not be able to issue hardcap tokens to a not whitelisted user", async () => {
			const balanceBefore = (await existedToken.ATxProxy.balanceOf.call(notWhitelistedAccount)).toNumber()
			await emissionProvider.issueHardcapToken(existedToken.ATxProxy.address, notWhitelistedAccount, secondHardcapTransferValue, { from: oracle, })
			assert.equal((await existedToken.ATxProxy.balanceOf.call(notWhitelistedAccount)).toNumber(), balanceBefore)
		})

		it("should be able to issue rest of hardcap tokens to account1 with OK code", async () => {
			assert.equal((await emissionProvider.issueHardcapToken.call(existedToken.ATxProxy.address, account1, secondHardcapTransferValue, { from: oracle, })).toNumber(), error.OK)
		})

		it("should be able to issue rest of hardcap tokens to account1", async () => {
			const balanceBefore = (await existedToken.ATxProxy.balanceOf.call(account1)).toNumber()
			await emissionProvider.issueHardcapToken(existedToken.ATxProxy.address, account1, secondHardcapTransferValue, { from: oracle, })
			assert.equal((await existedToken.ATxProxy.balanceOf.call(account1)).toNumber(), balanceBefore + secondHardcapTransferValue)
		})

		it("should have `Reached` state after reaching hardcap limit", async () => {
			const [ hardcapState, softcapState, ] = await emissionProvider.getState.call()
			assert.equal(hardcapState, State.Reached)
			assert.equal(softcapState, State.Sale)
		})

		const exceededHardcapTokenValue = 1

		it("shouldn't be able to issue more hardcap tokens after reaching limit with EMISSION_PROVIDER_WRONG_STATE code", async () => {
			assert.equal((await emissionProvider.issueHardcapToken.call(existedToken.ATxProxy.address, account1, exceededHardcapTokenValue, { from: oracle, })).toNumber(), error.EMISSION_PROVIDER_WRONG_STATE)
		})

		it("should have undistributed softcap tokens", async () => {
			assert.notEqual(await existedToken.ATxProxy.balanceOf.call(emissionProvider.address), 0)
		})

		it("should not be possible to manually finish hardcap sale after reaching hardcap by issuing with EMISSION_PROVIDER_WRONG_STATE code", async () => {
			const [hardcapState,] = await emissionProvider.getState.call()
			assert.equal(hardcapState.toNumber(), State.Reached)
			assert.equal((await emissionProvider.finishHardcap.call({ from: systemOwner, })).toNumber(), error.EMISSION_PROVIDER_WRONG_STATE)
		})

		it("should not be possible to manually finish hardcap sale after reaching hardcap by issuing", async () => {
			await emissionProvider.finishHardcap({ from: systemOwner, })
			const [ ,softcapState, ] = await emissionProvider.getState.call()
			assert.equal(softcapState.toNumber(), State.Sale)
		})

		it("should be able to distribute full softcap to a single user", async () => {
			const balanceBefore = (await existedToken.ATxProxy.balanceOf.call(account1)).toNumber()
			await emissionProvider.issueSoftcapToken(existedToken.ATxProxy.address, account1, cap.softcap, { from: oracle, })
			assert.equal((await existedToken.ATxProxy.balanceOf.call(emissionProvider.address)).toNumber(), 0)
			assert.equal((await existedToken.ATxProxy.balanceOf.call(account1)).toNumber(), balanceBefore + cap.softcap)
		})

		it("should have both reached states for softcap and hardcap", async () => {
			const [ hardcapState, softcapState, ] = await emissionProvider.getState.call()
			assert.equal(hardcapState, State.Reached)
			assert.equal(softcapState, State.Reached)
		})
	})

	context("bonus distribution", () => {
		let emissionProvider
		const cap = {
			softcap: undefined,
			hardcap: undefined,
		}
		const bonusAmount = 1300

		const account1ExternalId = "0xee00ff"
		const account2ExternalId = "0xaa00dd"
		const countryCode = 2

		before(async () => {
			[emissionProvider,] = await createEmissionProvider(moderatorGroupName, [moderator,])
			await emissionProvider.addOracles([oracle,], { from: systemOwner, })

			cap.softcap = (await emissionProvider.tokenSoftcap.call()).toNumber()
			cap.hardcap = (await emissionProvider.tokenHardcap.call()).toNumber()

			await existedToken.DataController.registerHolder(account1ExternalId, account1, countryCode, { from: systemOwner, })
			await existedToken.DataController.registerHolder(account2ExternalId, account2, countryCode, { from: systemOwner, })

			await emissionProvider.init({ from: systemOwner, })
			await setup.timeMachine.jumpDaysForward(1)
			await emissionProvider.addUsers([ account1, account2, ], { from: systemOwner, })
			await emissionProvider.issueSoftcapToken(existedToken.ATxProxy.address, account1, cap.softcap, { from: oracle, })
			await emissionProvider.finishHardcap({ from: systemOwner, })

			await setup.def.BMCProxy.transfer(oracle, bonusAmount, { from: systemOwner, })
		})

		after(async () => {
			await setup.revert()
		})

		it("should have finished sale period", async () => {
			const [ hardcapState, softcapState, ] = await emissionProvider.getState.call()
			assert.equal(hardcapState.toNumber(), State.Reached)
			assert.equal(softcapState.toNumber(), State.Reached)
		})

		it("couldn't finish issuing manually twice with EMISSION_PROVIDER_WRONG_STATE code", async () => {
			assert.equal((await emissionProvider.finishHardcap.call({ from: systemOwner, })).toNumber(), error.EMISSION_PROVIDER_WRONG_STATE)
		})

		it("couldn't finish issuing manually twice", async () => {
			const tx = await emissionProvider.finishHardcap({ from: systemOwner, })
			assert.lengthOf((await eventsHelper.findEvent([emissionProvider,], tx, "HardcapFinishedManually")), 0)
		})

		it("should not allow a non-oracle to distribute bonuses with UNAUTHORIZED code", async () => {
			const nonOracle = account1
			assert.equal((await emissionProvider.distributeBonuses.call({ from: nonOracle, })).toNumber(), error.UNAUTHORIZED)
		})

		it("should have no bonus token balance on a provider account address", async () => {
			assert.equal((await setup.def.BMCProxy.balanceOf.call(emissionProvider.address)).toNumber(), 0)
		})

		it("should not allow to distribute bonuses when a provider has no available bonus tokens on his balance with EMISSION_PROVIDER_INSUFFICIENT_BMC code", async () => {
			assert.equal((await emissionProvider.distributeBonuses.call({ from: oracle, })).toNumber(), error.EMISSION_PROVIDER_INSUFFICIENT_BMC)
		})

		it("oracle should transfer some bonus token amount to a provider", async () => {
			assert.equal((await setup.def.BMCProxy.balanceOf.call(oracle)).toNumber(), bonusAmount)
			await setup.def.BMCProxy.transfer(emissionProvider.address, bonusAmount, { from: oracle, })
			assert.equal((await setup.def.BMCProxy.balanceOf.call(emissionProvider.address)).toNumber(), bonusAmount)
		})

		let beforeDistributionProfiteroleBalance

		it("should snapshot a profiterole wallet balance before bonus distribution", async () => {
			beforeDistributionProfiteroleBalance = (await setup.def.BMCProxy.balanceOf.call(existedToken.ProfiteroleWallet.address)).toNumber()
		})

		it("should allow an oracle to distribute bonuses with OK code", async () => {
			assert.equal((await emissionProvider.distributeBonuses.call({ from: oracle, })).toNumber(), error.OK)
		})

		it("should allow an oracle to distribute bonuses", async () => {
			await emissionProvider.distributeBonuses({ from: oracle, })
			assert.equal((await setup.def.BMCProxy.balanceOf.call(emissionProvider.address)).toNumber(), 0)
		})

		it("profiterole wallet should accept bonuses on its balance", async () => {
			assert.equal((await setup.def.BMCProxy.balanceOf.call(existedToken.ProfiteroleWallet.address)).toNumber(), beforeDistributionProfiteroleBalance + bonusAmount)
		})

		it("should not have automatic destruction mode after bonus distribution", async () => {
			assert.isFalse(await emissionProvider.destructed.call())
		})

		const nonContractOwner = account1

		it("should not allow a provider destruction to non-contract owner with UNAUTHORIZED code", async () => {
			assert.equal((await emissionProvider.activateDestruction.call({ from: nonContractOwner, })).toNumber(), error.UNAUTHORIZED)
		})

		it("should not allow a provider destruction to non-contract owner", async () => {
			await emissionProvider.activateDestruction({ from: nonContractOwner, })
			assert.isFalse(await emissionProvider.destructed.call())
		})

		it("should allow a provider destruction to contract owner with OK code", async () => {
			assert.equal((await emissionProvider.activateDestruction.call({ from: systemOwner, })).toNumber(), error.OK)
		})

		it("should allow a provider destruction to contract owner with OK code", async () => {
			await emissionProvider.activateDestruction({ from: systemOwner, })
			assert.isTrue(await emissionProvider.destructed.call())
		})

		const moreBonusAmount = 500

		it("should allow to transfer bonus tokens to a provider's address after the destruction was activated", async () => {
			await setup.def.BMCProxy.transfer(emissionProvider.address, moreBonusAmount, { from: systemOwner, })
			assert.equal((await setup.def.BMCProxy.balanceOf.call(emissionProvider.address)).toNumber(), moreBonusAmount)
		})

		it("shouldn't allow to distribute bonuses after destruction was activated with EMISSION_PROVIDER_WRONG_STATE code", async () => {
			assert.equal((await emissionProvider.distributeBonuses.call({ from: oracle, })).toNumber(), error.EMISSION_PROVIDER_WRONG_STATE)
		})

		it("shouldn't allow to distribute bonuses after destruction was activated", async () => {
			await emissionProvider.distributeBonuses({ from: oracle, })
			assert.equal((await setup.def.BMCProxy.balanceOf.call(emissionProvider.address)).toNumber(), moreBonusAmount)
		})
	})
})
