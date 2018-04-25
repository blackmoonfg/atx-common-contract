const contract = require("truffle-contract")

const Reverter = require('bmc-contract/common/helpers/reverter')
const TimeMachine = require('bmc-contract/common/helpers/timemachine')
const PendingFacade = require('bmc-contract/common/helpers/pending-facade')

const ServiceController = artifacts.require('ServiceController')
const DataController = artifacts.require('DataController')
const Profiterole = artifacts.require('Profiterole')
const ProfiteroleWallet = artifacts.require('ProfiteroleWallet')
const Treasury = artifacts.require('Treasury')

const ATxProxy = artifacts.require('ATxAssetProxy')
const ATxAsset = artifacts.require('ExampleAsset')

const contractModulesContext = require("../../common/context")
const GroupRegistration = require("../../common/atoms/accessGroupRegistration")

module.exports = Setup

const reverter = new Reverter(web3)
const timeMachine = new TimeMachine(web3)

function Setup(needLog, atxPlatformType) {
	const self = this

	this.def = {}
	this.moduleContext = undefined
	this.web3 = web3

	this.reverter = reverter
	this.timeMachine = timeMachine

	const testGroup = web3.sha3("testGroup")
	// const ownerTestGroup = web3.sha3("ownerTestGroup")

	this.init = () => {
		afterEach('revert', self.reverter.revert)
	}

	this.revert = self.reverter.revertPromise
	this.snapshot = self.reverter.snapshotPromise

	this.beforeAll = async () => {
		try {
			self.moduleContext = await contractModulesContext(web3, artifacts, self.reverter)
			self.groupRegistration = new GroupRegistration(self.moduleContext)

			initAccounts()
			await initFields()
			await initState()
		}
		catch (e) {
			console.log("Error:", e)
			throw e
		}
	}

	function initAccounts() {

		LOG('Instantiate accounts')

		self.accounts = self.moduleContext.accounts
		self.owner = self.accounts[ 0 ]
	}

	async function initFields() {

		LOG('Instantiate the deployed contracts.')

		self.def.BMCPlatform = self.moduleContext.bmcPlatform
		self.def.BMCProxy = self.moduleContext.bmcToken
		self.def.MultiEventsHistory = self.moduleContext.eventsHistory

		switch (atxPlatformType) {
		case 'Testable' :
			if (self.moduleContext.atxPlatformServiceAllowanceTestable === undefined) {
				throw `Invalid initialization of context. "atxPlatformServiceAllowanceTestable" is undefined`
			}

			self.def.ATxPlatform = self.moduleContext.atxPlatformServiceAllowanceTestable

			await self.def.MultiEventsHistory.authorize(self.def.ATxPlatform.address)
			await self.def.ATxPlatform.setupEventsHistory(self.def.MultiEventsHistory.address)

			break
		default:
			self.def.ATxPlatform = self.moduleContext.atxPlatform
			break
		}

		self.def.TokenSender = self.moduleContext.tokenSender

		self.def.Withdrawal = self.moduleContext.nonOperationalWithdrawManager
		self.def.GroupsAccessManager = self.moduleContext.groupsAccessManager
		self.def.PendingManager = self.moduleContext.pendingManager

		self.def.PendingFacade = self.moduleContext.pendingFacade

		self.def.group = testGroup
		self.def.groupModerators = [self.accounts[0],]
		await self.groupRegistration.createGroup(self.def.group, self.def.groupModerators)
		self.token = [ await createToken(1), await createToken(2), ]

		self.def.TestPendingManager = await self.moduleContext.PendingManager.new(self.def.GroupsAccessManager.address)
		self.def.TestPendingFacade = new PendingFacade(self.def.TestPendingManager, self.web3)
	}

	async function initState() {

		LOG("Instantiate contract's state.")

		await initContext(self.token[ 0 ])
		await initContext(self.token[ 1 ])
		initDefValues()
	}

	function initDefValues() {

		LOG('Instantiate def values')

		const defToken = self.token[ 0 ]
		self.defToken = defToken
		self.BMCPlatform = self.def.BMCPlatform
		self.BMCAsset = self.def.BMCAsset
		self.BMCProxy = self.def.BMCProxy
		self.MultiEventsHistory = self.def.MultiEventsHistory

		self.ATxPlatform = self.def.ATxPlatform
		self.ATxAsset = defToken.ATxAsset
		self.ATxProxy = defToken.ATxProxy

		self.DataController = defToken.DataController
		self.ServiceController = defToken.ServiceController

		self.Profiterole = defToken.Profiterole
		self.ProfiteroleWallet = defToken.ProfiteroleWallet
		self.Treasury = defToken.Treasury
		self.Withdrawal = defToken.Withdrawal

		self.GroupsAccessManager = self.def.GroupsAccessManager
		self.PendingManager = self.def.PendingManager

		self.TestPendingManager = self.def.TestPendingManager
	}

	async function initContext(token) {
		LOG([ 'Instantiate context for token : ', token.symbol, ])

		LOG('Platform - Asset - Proxy')
		await self.def.ATxPlatform.issueAsset(token.symbol, token.value, token.name, token.description, token.baseUnit, token.isReissuable, { from: self.accounts[0] })
		token.ATxAsset = await ATxAsset.new()
		token.ATxProxy = await ATxProxy.new()

		LOG('Treasure')
		token.Treasury = await Treasury.new(self.def.BMCProxy.address)

		LOG('Profitrole')
		token.ProfiteroleWallet = await ProfiteroleWallet.new()
		token.Profiterole = await Profiterole.new(self.def.BMCProxy.address, token.Treasury.address, token.ProfiteroleWallet.address)

		await token.ProfiteroleWallet.init(token.Profiterole.address)
		await token.Treasury.init(token.Profiterole.address)

		await token.ATxProxy.init(self.def.ATxPlatform.address, token.symbol, token.name)
		await token.ATxProxy.proposeUpgrade(token.ATxAsset.address)
		await self.def.ATxPlatform.setProxy(token.ATxProxy.address, token.symbol)

		token.ServiceController = await ServiceController.new(self.def.TestPendingManager.address, token.ATxProxy.address, token.Profiterole.address, token.Treasury.address)
		token.DataController = await DataController.new(token.ServiceController.address, token.ATxAsset.address)

		await token.ATxAsset.initAtx(token.ATxProxy.address, token.ServiceController.address, token.DataController.address, token.lockupDate)

		token.Withdrawal = self.moduleContext.nonOperationalWithdrawManager
		await token.DataController.setWithdraw(token.Withdrawal.address)

		await self.def.PendingManager.signIn(token.ServiceController.address)
		await self.def.PendingManager.signIn(token.DataController.address)
		await self.def.PendingManager.signIn(token.Withdrawal.address)

		await self.def.TestPendingManager.signIn(token.ServiceController.address)
		await self.def.TestPendingManager.signIn(token.DataController.address)
		await self.def.TestPendingManager.signIn(token.Withdrawal.address)

		await fillPolicyRules(token)
	}

	async function fillPolicyRules(token) {
		LOG('Fill policy rules')

		const limit = 1

		LOG('Add policy rules for Withdrawal')
		await self.def.PendingFacade.addPolicyRule(token.Withdrawal, token.Withdrawal.contract.withdraw.getData(0, 0x0, 0), self.def.group, limit)
		// await self.def.PendingFacade.addPolicyRule(token.Withdrawal, token.Withdrawal.contract.withdraw.getData(0, 0x0, 0), ownerTesttestGroup, limit)

		await self.def.TestPendingFacade.addPolicyRule(token.Withdrawal, token.Withdrawal.contract.withdraw.getData(0, 0x0, 0), self.def.group, limit)
		// await self.def.TestPendingFacade.addPolicyRule(token.Withdrawal, token.Withdrawal.contract.withdraw.getData(0, 0x0, 0), ownerTesttestGroup, limit)
	}

	async function createToken(number) {
		LOG([ 'Create context for ', number, ])

		const delay = 10000 * number

		const lockupDate = await self.timeMachine.getFutureTime(delay)

		const baseUnit = 10
		const decimal = 2

		const amounts = [ 5000 * number, 2500 * number, 1200 * number, 600 * number, ]

		const symbol = "T" + number
		const name = "TOKEN" + number
		const description = "TOKEN" + number
		const reissuable = true
		const value = 10000 * number

		return new Context(symbol, value, name, description, decimal, reissuable, amounts, baseUnit, decimal, lockupDate)
	}

	function LOG(messege) {
		if (needLog) {
			console.log(messege)
		}
	}
}

function Context(symbol, value, name, description, baseUnit, isReissuable, amounts, fee, decimal, lockupDate) {
	this.symbol = symbol
	this.value = value
	this.name = name
	this.description = description
	this.baseUnit = baseUnit
	this.isReissuable = isReissuable
	this.amounts = amounts
	this.fee = fee
	this.decimal = decimal
	this.lockupDate = lockupDate
}
