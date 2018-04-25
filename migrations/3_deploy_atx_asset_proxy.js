const ATxProxy = artifacts.require("ATxAssetProxy")
const path = require("path")

module.exports = deployer => {
	deployer.then(async () => {
		await deployer.deploy(ATxProxy)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] ATx Asset Proxy deploy: #done")
	})
}
