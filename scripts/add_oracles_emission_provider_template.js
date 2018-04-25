const contractsModuleContext = require("../common/context")
const EmissionProvider = artifacts.require("EmissionProvider")

module.exports = async callback => {
	const moduleContext = await contractsModuleContext(web3)
	const systemOwner = moduleContext.accounts[0]

	const emissionProviderAddress = "" // TODO: add addresses
	const oracles = [] // TODO: add addresses

	if (emissionProviderAddress === "") {
		console.log(`${__filename} No emissionProvider address was found`)
		callback()
		return
	}

	const emissionProvider = await EmissionProvider.at(emissionProviderAddress)

	if ((await emissionProvider.addOracles.call(oracles, { from: systemOwner, })).toNumber() === 1) {
		await emissionProvider.addOracles(oracles, { from: systemOwner, })
	}

	console.log(`[${__filename}] Oracles added "${oracles.toString()}": #done`)

	callback()
}