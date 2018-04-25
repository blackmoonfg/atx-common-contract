const contractsModuleContext = require("../common/context")
const DataController = artifacts.require("DataController")

module.exports = async callback => {
	const moduleContext = await contractsModuleContext(web3)
	const systemOwner = moduleContext.accounts[0]

	const assetDataController = await DataController.deployed()

	const oracles = [] // TODO: add oracle addresses

	// TODO: comment unnecessary methods
	const addOracles = async (dataController, oracle) => {
		const methods = [
			[ "registerHolder", dataController.contract.registerHolder.getData(0x0, 0x0, 0).slice(0, 10), ],
			[ "addHolderAddress", dataController.contract.addHolderAddress.getData(0x0, 0x0).slice(0, 10), ],
			[ "removeHolderAddress", dataController.contract.removeHolderAddress.getData(0x0, 0x0).slice(0, 10), ],
			[ "changeOperational", dataController.contract.changeOperational.getData(0x0, false).slice(0, 10), ],
			[ "updateTextForHolder", dataController.contract.updateTextForHolder.getData(0x0, "").slice(0, 10), ],
			[ "updateLimitPerDay", dataController.contract.updateLimitPerDay.getData(0x0, 0).slice(0, 10), ],
			[ "updateLimitPerMonth", dataController.contract.updateLimitPerMonth.getData(0x0, 0).slice(0, 10), ],
			[ "changeCountryLimit", dataController.contract.changeCountryLimit.getData(0, 0).slice(0, 10), ],
		]

		const params = methods
			.reduce((acc, method) => {
				acc.signatures.push(method[1])
				acc.oracles.push(oracle)
				return acc
			}, { signatures: [], oracles: [], })

		if ((await dataController.addOracles.call(params.signatures, params.oracles, { from: systemOwner, })).toNumber() === 1) {
			await dataController.addOracles(params.signatures, params.oracles, { from: systemOwner, })
		}
	}

	for (var oracle of oracles) {
		await addOracles(assetDataController, oracle)
	}

	console.log(`[${__filename}] Oracles added "${oracles.toString()}": #done`)

	callback()
}