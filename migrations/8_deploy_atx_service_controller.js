const Treasury = artifacts.require("Treasury")
const Profiterole = artifacts.require("Profiterole")
const ServiceController = artifacts.require("ServiceController")
const ATxAssetProxy = artifacts.require("ATxAssetProxy")
const path = require("path")

const contractsModuleContext = require("../common/context")

module.exports = deployer => {
	deployer.then(async () => {
		const moduleContext = await contractsModuleContext(web3, artifacts)
		await deployer.deploy(ServiceController, moduleContext.pendingManager.address, ATxAssetProxy.address, Profiterole.address, Treasury.address)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] ATx Asset ServiceController deploy: #done")
	})
}
