const ATxAssetProxy = artifacts.require("ATxAssetProxy")

const contractsModuleContext = require("../common/context")
const EmissionProviderService = require("../common/atoms/emissionProviderService")

module.exports = async callback => {
	const moduleContext = await contractsModuleContext(web3, artifacts)
	const systemOwner = moduleContext.accounts[0] // TODO: insert needed account address for deployment purpose

	const emissionProviderService = new EmissionProviderService(moduleContext, artifacts)
	const token = await ATxAssetProxy.deployed()
	const [ , tokenProfiterole, ] = await emissionProviderService.getTokenServices(token)

	let moderator // = { user: systemOwner, group: "[GROUP NAME]", } // TODO: insert moderator's config to automatically approve emission provider's creation

	const startDate = new Date("2018-04-1T12:00:00Z")
	const endDate = new Date("2018-05-1T12:00:00Z")
	const softcap = 1000
	const hardcap = 2000

	const getEmissionProviderConfig = async (softcapValue = softcap, hardcapValue = hardcap) => {
		return [
			token.address,
			moduleContext.bmcToken.address,
			tokenProfiterole.address,
			startDate.getTime(),
			endDate.getTime(),
			softcapValue,
			hardcapValue,
		]
	}

	const config = await getEmissionProviderConfig()
	const [ emissionProvider, blockNumber, ] = await emissionProviderService.createEmissionProvider(config, token, moderator, systemOwner)

	console.log(`[${__filename}] ${emissionProvider.address} at block ${blockNumber}: #done`)

	callback()
}
