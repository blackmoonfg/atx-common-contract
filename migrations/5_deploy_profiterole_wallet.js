const ProfiteroleWallet = artifacts.require('ProfiteroleWallet')
const path = require("path")

module.exports = deployer => {
	deployer.then(async () => {
		await deployer.deploy(ProfiteroleWallet)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] Profiterole Wallet deploy: #done")
	})
}
