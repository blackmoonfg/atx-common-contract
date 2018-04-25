const Treasury = artifacts.require('Treasury')
const path = require("path")

const contractsModuleContext = require("../common/context")

module.exports = deployer => {
	deployer.then(async () => {
		const moduleContext = await contractsModuleContext(web3, artifacts)
		await deployer.deploy(Treasury, moduleContext.bmcToken.address)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] Treasury deploy: #done")
	})
}
