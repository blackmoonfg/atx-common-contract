const ATxAssetProxy = artifacts.require("ATxAssetProxy")
const ServiceController = artifacts.require("ServiceController")

const contractsModuleContext = require("../common/context")
const GroupRegistration = require("../common/atoms/accessGroupRegistration")
const PoliciesService = require("../common/atoms/policiesService")
const path = require("path")

module.exports = deployer => {
	deployer.then(async () => {
		const moduleContext = await contractsModuleContext(web3, artifacts)
		const groupRegistration = new GroupRegistration(moduleContext)
		const policiesService = new PoliciesService(moduleContext)

		const GROUP_NAME = "[Moderators Group Name]" // TODO: change value here
		const moderators = [] // TODO: add moderators' addresses here

		const OWNER_GROUP_NAME = "[ATx Owner Group Name]" // TODO: change value here
		const token = await ATxAssetProxy.deployed()
		const tokenOwner = await token.contractOwner.call()

		// Needed a group of moderators that will perform a role of controllers for PendingManager
		await groupRegistration.createGroup(GROUP_NAME, moderators)

		// Needed a group with only one user which is a token's owner. Will be used only for non operational withdrawals
		await groupRegistration.createGroup(OWNER_GROUP_NAME, [tokenOwner,])

		await fillPolicyRules()

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] ATx Asset policies setup: #done")

		async function fillPolicyRules() {
			const ACCEPT_LIMIT = 1
			const DECLINE_LIMIT = 1
			const assetServiceController = await ServiceController.deployed()

			console.log(`[ServiceController: add policy rules]`)
			await policiesService.addPolicyForServiceController(
				assetServiceController,
				GROUP_NAME,
				ACCEPT_LIMIT,
				DECLINE_LIMIT
			)

			console.log(`[Withdrawal: add policy rules]`)
			await policiesService.addPolicyForWithdrawingFromNonOperational(
				moduleContext.nonOperationalWithdrawManager,
				[ GROUP_NAME, OWNER_GROUP_NAME, ],
				[ ACCEPT_LIMIT, ACCEPT_LIMIT, ],
				[ DECLINE_LIMIT, DECLINE_LIMIT, ]
			)
		}
	})
}
