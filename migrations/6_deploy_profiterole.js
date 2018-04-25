const ProfiteroleWallet = artifacts.require('ProfiteroleWallet')
const Profiterole = artifacts.require('Profiterole')
const Treasury = artifacts.require('Treasury')
const path = require("path")

const contractsModuleContext = require("../common/context")

module.exports = deployer => {
	deployer.then(async () => {
		const moduleContext = await contractsModuleContext(web3, artifacts)
		await deployer.deploy(Profiterole, moduleContext.bmcToken.address, Treasury.address, ProfiteroleWallet.address)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] Profiterole deploy: #done")
	})
}
