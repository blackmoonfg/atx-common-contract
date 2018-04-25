const Proxy = artifacts.require("ATxAssetProxy")
const Asset = artifacts.require("ExampleAsset")
const ServiceController = artifacts.require("ServiceController")
const DataController = artifacts.require("DataController")

const contractsModuleContext = require("../common/context")
const path = require("path")

module.exports = deployer => {
	deployer.then(async () => {
		const moduleContext = await contractsModuleContext(web3, artifacts)

		const proxy = await Proxy.deployed()
		const asset = await Asset.deployed()

		const symbol = "[Symbol]"
		const name = "[Name]"
		const description = "[Description]"
		const value = 1000000
		const baseUnit = 10
		const isReissuable = true // NOTICE: needed to be `true` to fully use EmissionProvider and BurningMan functionalities

		const lockupDays = 400
		const lockupDate = await moduleContext.timeMachine.addDays(new Date(), lockupDays) // TODO: could be `0` and no lockup date will be set

		await moduleContext.atxPlatform.issueAsset(symbol, value, name, description, baseUnit, isReissuable)
		await proxy.init(moduleContext.atxPlatform.address, symbol, name)
		await proxy.proposeUpgrade(asset.address)
		await moduleContext.atxPlatform.setProxy(proxy.address, symbol)
		await asset.initAtx(proxy.address, ServiceController.address, DataController.address, lockupDate.getTime())

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] ATx Asset setup: #done")
	})
}
