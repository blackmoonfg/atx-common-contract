
const utils = require('bmc-contract/common/helpers/utils')
const Setup = require('../setup/setup')

const GroupRegistration = require("../../common/atoms/accessGroupRegistration")
const EmissionProviderService = require("../../common/atoms/emissionProviderService")
const BurningManService = require("../../common/atoms/burningManService")
const PoliciesService = require("../../common/atoms/policiesService")

contract('ServiceTransferTest :', accounts => {

	const INT_BIG_NUMBER = 2**32

	const setup = new Setup(false, "Testable")

	const moderatorGroupName = "Moderator Group"

	const lastAccIndex = accounts.length - 1
	const holder1 = accounts[1]
	const holder2 = accounts[2]
	const systemOwner = accounts[0]
	const moderator = accounts[5]
	const oracle = accounts[6]
	const unregisteredAccount = accounts[lastAccIndex]

	let tokenSender
	let token

	let groupRegistration
	let emissionProviderService
	let burningManService
	let policiesService

	const [ externalAccount1Id, externalAccount2Id, ] = [ "0x1100110011", "0x2200220022", ]

	let emissionProvider
	let burningMan

	const getEmissionProviderConfig = async (softcapValue = 1000, hardcapValue = 2000, durationInDays = 5) => {
		const advantage = 100
		const duration = durationInDays*24*60*60
		return [
			token.ATxProxy.address,
			setup.moduleContext.bmcToken.address,
			token.Profiterole.address,
			(await setup.timeMachine.getCurrentTime()) + advantage,
			await setup.timeMachine.getFutureTime(advantage + duration),
			softcapValue,
			hardcapValue,
		]
	}

	const createEmissionProvider = async (moderatorGroupName, moderators, limit = 1) => {
		await policiesService.addPolicyForAddingEmissionProvider(token.ServiceController, moderatorGroupName, limit, limit)

		const config = await getEmissionProviderConfig()
		const [emissionProvider,] = await emissionProviderService.createEmissionProvider(
			config,
			token.ATxProxy,
			{ user: moderators[0], group: moderatorGroupName, },
			systemOwner,
			setup.ATxPlatform,
		)

		return [ emissionProvider, config, ]
	}

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
		await policiesService.addPolicyForAddingBurningMan(token.ServiceController, moderatorGroupName, limit, limit)

		const config = await getBurningManConfig()
		const [burningMan,] = await burningManService.createBurningMan(
			config,
			token.ATxProxy,
			{ user: moderators[0], group: moderatorGroupName, },
			systemOwner,
			setup.ATxPlatform,
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

	before('Before', async () => {
		await setup.snapshot()

		await setup.beforeAll()

		token = setup.defToken
		tokenSender = setup.moduleContext.tokenSender

		groupRegistration = new GroupRegistration(setup.moduleContext)
		emissionProviderService = new EmissionProviderService(setup.moduleContext)
		burningManService = new BurningManService(setup.moduleContext)
		policiesService = new PoliciesService(setup.moduleContext, setup.def.TestPendingFacade)

		const moderators = [moderator,]
		await groupRegistration.createGroup(moderatorGroupName, moderators);

		[burningMan,] = await createBurningMan(moderatorGroupName, moderators);
		[emissionProvider,] = await createEmissionProvider(moderatorGroupName, moderators);
		await emissionProvider.addOracles([oracle,], { from: systemOwner, })

		await setupDataControllerOracles(token.DataController, oracle)
		await registerHolders([ externalAccount1Id, externalAccount2Id, ], [ holder1, holder2, ])

		await emissionProvider.addOracles([oracle,], { from: systemOwner, })
		await emissionProvider.init({ from: systemOwner, })

		await setup.timeMachine.jumpDaysForward(1)

		await emissionProvider.addUsers([ holder1, holder2, ], { from: systemOwner, })

		const addresses = [
			burningMan.address,
			emissionProvider.address,
			setup.DataController.address,
			holder1,
			holder2,
		]
		const part = 200
		const totalAmount = part * addresses.length
		const amounts = []
		for (let i = 0; i < addresses.length; i++) {
			amounts.push(part)
		}

		await setup.ATxPlatform.reissueAsset(token.symbol, totalAmount, { from: systemOwner, })
		await setup.ATxPlatform.massTransfer(addresses, amounts, token.symbol, { from: systemOwner, })

		await setup.snapshot()
	})

	after("cleanup", async () => {
		await setup.revert(INT_BIG_NUMBER)
	})

	afterEach("revert", async () => {
		await setup.revert()
	})

	context("Test method 'transfer' :", () => {
		context("Unregistered account :", () => {

			// Negative tests
			it('should fail sending transaction from unregistered account to holder', async () => {
				await failedTransferATXFromUnregisteredAccount(holder1)
			})

			it('should fail sending transaction from unregistered account to unregistered account', async () => {
				await failedTransferATXFromUnregisteredAccount(unregisteredAccount)
			})

			it('should fail sending transaction from unregistered account to emission provider', async () => {
				await failedTransferATXFromUnregisteredAccount(emissionProvider)
			})

			it('should fail sending transaction from unregistered account to burning man', async () => {
				await failedTransferATXFromUnregisteredAccount(burningMan)
			})

			it('should fail sending transaction from unregistered account to data controller', async () => {
				await failedTransferATXFromUnregisteredAccount(setup.DataController)
			})

			it('should fail sending transaction from unregistered account to profiterole', async () => {
				await failedTransferATXFromUnregisteredAccount(setup.Profiterole)
			})

			it('should fail sending transaction from unregistered account to profiterole wallet', async () => {
				await failedTransferATXFromUnregisteredAccount(setup.ProfiteroleWallet)
			})

			async function failedTransferATXFromUnregisteredAccount(controller) {
				await failedATxTransferTest(unregisteredAccount, controller)
			}
		})

		context("Holder :", () => {

			// Positive tests
			it('should send transaction from holder to holder', async () => {
				await successTransferATXFromAccount(holder2)
			})

			it('should send transaction from holder to burning man', async () => {
				await successTransferATXFromAccount(burningMan)
			})

			// // Negative tests
			it('should fail sending transaction from holder to unregistered account', async () => {
				await failedTransferATXFromAccount(unregisteredAccount)
			})

			it('should fail sending transaction from holder to emission provider', async () => {
				await failedTransferATXFromAccount(emissionProvider)
			})

			it('should fail sending transaction from holder to data controller', async () => {
				await failedTransferATXFromAccount(setup.DataController)
			})

			it('should fail sending transaction from holder to profiterole', async () => {
				await failedTransferATXFromAccount(setup.Profiterole)
			})

			it('should fail sending transaction from holder to profiterole wallet', async () => {
				await failedTransferATXFromAccount(setup.ProfiteroleWallet)
			})

			async function successTransferATXFromAccount(controller) {
				await successATxTransferTest(holder1, controller)
			}

		})
		async function failedTransferATXFromAccount(controller) {
			await failedATxTransferTest(holder1, controller)
		}

		context("Emission Provider :", () => {

			// Positive tests
			it('should send transaction from emission provider to holder', async () => {
				await successTransferATxFromEmissionProvider(holder1)
			})

			// Negative tests
			it('should fail sending transaction from emission provider to unregistered account', async () => {
				await failedTransferATxFromEmissionProvider(unregisteredAccount)
			})

			it('should fail sending transaction from emission provider to emission provider', async () => {
				await failedTransferATxFromEmissionProvider(emissionProvider)
			})

			it('should fail sending transaction from emission provider to burning man', async () => {
				await failedTransferATxFromEmissionProvider(burningMan)
			})

			it('should fail sending transaction from emission provider to data controller', async () => {
				await failedTransferATxFromEmissionProvider(setup.DataController)
			})

			it('should fail sending transaction from emission provider to profiterole', async () => {
				await failedTransferATxFromEmissionProvider(setup.Profiterole)
			})

			it('should fail sending transaction from emission provider to profiterole wallet', async () => {
				await failedTransferATxFromEmissionProvider(setup.ProfiteroleWallet)
			})

			async function successTransferATxFromEmissionProvider(controller) {
				await successATxTransferTest(emissionProvider, controller)
			}

			async function failedTransferATxFromEmissionProvider(controller) {
				await failedATxTransferTest(emissionProvider, controller)
			}
		})

		context("Burning Man :", () => {

			// Positive tests
			it('should send transaction from burning man to holder', async () => {
				await successTransferATxFromBurningMan(holder1)
			})

			// Negative tests
			it('should fail sending transaction from burning man to unregistered account', async () => {
				await failedTransferATxFromBurningMan(unregisteredAccount)
			})

			it('should fail sending transaction from burning man to emission provider', async () => {
				await failedTransferATxFromBurningMan(emissionProvider)
			})

			it('should fail sending transaction from burning man to burning man', async () => {
				await failedTransferATxFromBurningMan(burningMan)
			})

			it('should fail sending transaction from burning man to data controller', async () => {
				await failedTransferATxFromBurningMan(setup.DataController)
			})

			it('should fail sending transaction from burning man to profiterole', async () => {
				await failedTransferATxFromBurningMan(setup.Profiterole)
			})

			it('should fail sending transaction from burning man to profiterole wallet', async () => {
				await failedTransferATxFromBurningMan(setup.ProfiteroleWallet)
			})

			async function successTransferATxFromBurningMan(controller) {
				await successATxTransferTest(burningMan, controller)
			}

			async function failedTransferATxFromBurningMan(controller) {
				await failedATxTransferTest(burningMan, controller)
			}
		})
	})

	async function successATxTransferTest(from, to) {
		await successTransferTest(setup.ATxProxy, from, to)
	}

	async function successTransferTest(proxy, _from, _to) {

		const proxyAddress = utils.getAddress(proxy)
		const from = utils.getAddress(_from)
		const to = utils.getAddress(_to)

		const amount = 100

		const balanceBefore1 = (await proxy.balanceOf.call(from, { from: from, })).toNumber()
		const balanceBefore2 = (await proxy.balanceOf.call(to, { from: from, })).toNumber()

		const result = await tokenSender.transfer.call(proxyAddress, from, to, amount)
		assert.isTrue(result)

		await tokenSender.transfer(proxyAddress, from, to, amount)

		const balanceAfter1 = (await proxy.balanceOf.call(from, { from: from, })).toNumber()
		const balanceAfter2 = (await proxy.balanceOf.call(to, { from: from, })).toNumber()

		assert.equal(parseInt(balanceBefore1) - parseInt(amount), balanceAfter1)
		assert.equal(parseInt(balanceBefore2) + parseInt(amount), balanceAfter2)
	}

	async function failedATxTransferTest(from, to) {
		await failedTransferTest(setup.ATxProxy, from, to)
	}

	async function failedTransferTest(proxy, _from, _to) {

		const proxyAddress = utils.getAddress(proxy)
		const from = utils.getAddress(_from)
		const to = utils.getAddress(_to)

		const amount = 100

		const balanceBefore1 = (await proxy.balanceOf.call(from, { from: from, })).toNumber()
		const balanceBefore2 = (await proxy.balanceOf.call(to, { from: from, })).toNumber()

		const result = await tokenSender.transfer.call(proxyAddress, from, to, amount, { from: from, })
		assert.isFalse(result)

		await tokenSender.transfer(proxyAddress, from, to, amount)

		const balanceAfter1 = (await proxy.balanceOf.call(from, { from: from, })).toNumber()
		const balanceAfter2 = (await proxy.balanceOf.call(to, { from: from, })).toNumber()

		assert.equal(balanceBefore1, balanceAfter1)
		assert.equal(balanceBefore2, balanceAfter2)
	}
})
