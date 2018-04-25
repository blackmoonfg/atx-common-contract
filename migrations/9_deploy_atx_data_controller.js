const ServiceController = artifacts.require("ServiceController")
const DataController = artifacts.require("DataController")
const ExampleAsset = artifacts.require("ExampleAsset")
const path = require("path")

module.exports = deployer => {
	deployer.then(async () => {
		await deployer.deploy(DataController, ServiceController.address, ExampleAsset.address)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] ATx Asset DataController deploy: #done")
	})
}
