const ATxAssetProxy = artifacts.require("ATxAssetProxy")

const contractsModuleContext = require("../common/context")
const BurningManService = require("../common/atoms/burningManService")

module.exports = async callback => {
	const moduleContext = await contractsModuleContext(web3, artifacts)
	const systemOwner = moduleContext.accounts[0] // TODO: insert needed account address for deployment purpose

	const burningManService = new BurningManService(moduleContext, artifacts)
	const token = await ATxAssetProxy.deployed()
	const [ , tokenProfiterole, ] = await burningManService.getTokenServices(token)

	let moderator // = { user: systemOwner, group: "[GROUP NAME]", } // TODO: insert moderator's config to automatically approve emission provider's creation

	const startDate = new Date("2018-04-1T12:00:00Z")
	const endDate = new Date("2018-05-1T12:00:00Z")
	const redemptionFee = 10
	const redemptionFeeDecimals = 2
	const exchangePrice = 100
	const maxAmountForBuyback = 10000

	const getBurningManConfig = () => {
		return [
			token.address,
			context.bmcToken.address,
			tokenProfiterole.address,
			startDate.getTime(),
			endDate.getTime(),
			redemptionFee,
			redemptionFeeDecimals,
			exchangePrice,
			maxAmountForBuyback,
		]
	}

	const config = getBurningManConfig()
	const [ burningMan, blockNumber, ] = await burningManService.createBurningMan(config, token, moderator, systemOwner)

	console.log(`[${__filename}] ${burningMan.address} at block ${blockNumber}: #done`)

	callback()
}