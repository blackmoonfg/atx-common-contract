const ServiceController = artifacts.require("ServiceController")
const DataController = artifacts.require("DataController")
const path = require("path")

const contractsModuleContext = require("../common/context")

module.exports = deployer => {
	deployer.then(async () => {
		const moduleContext = await contractsModuleContext(web3, artifacts)
		const assetDataController = await DataController.deployed()

		await assetDataController.setWithdraw(moduleContext.nonOperationalWithdrawManager.address)

		await moduleContext.pendingManager.signIn(moduleContext.nonOperationalWithdrawManager.address)
		await moduleContext.pendingManager.signIn(ServiceController.address)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] ATx Asset with managers bind: #done")
	})
}
