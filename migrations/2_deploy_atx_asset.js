const ExampleAsset = artifacts.require("ExampleAsset")
const path = require("path")

module.exports = deployer => {
	deployer.then(async () => {
		await deployer.deploy(ExampleAsset)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] ATx Asset deploy: #done")
	})
}
