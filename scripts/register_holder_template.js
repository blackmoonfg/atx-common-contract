const DataController = artifacts.require("DataController")
const ATxAssetProxy = artifacts.require("ATxAssetProxy")
const contractsModuleContext = require("../common/context")

module.exports = async callback => {
	// TODO: at first check that oracles are added for each method in the data controller

	const moduleContext = await contractsModuleContext(web3, artifacts)

	const COUNTRY_CODE = 1
	const EXTERNAL_HOLDER_ACCOUNT_ID = 1
	const HOLDER_ETHEREUM_ADDRESS = 0x0
	const oracle = moduleContext.accounts[0] // TODO: use proper oracle account address

	const assetDataController = await DataController.deployed()

	await assetDataController.registerHolder(EXTERNAL_HOLDER_ACCOUNT_ID, HOLDER_ETHEREUM_ADDRESS, COUNTRY_CODE, { from: oracle, })

	const token = await ATxAssetProxy.deployed()
	console.log(`[${__filename}] ${await token.smbl.call()} with [COUNTRY_CODE:${COUNTRY_CODE}], [ACCOUNT_ID:${EXTERNAL_HOLDER_ACCOUNT_ID}], [ETH_ADDRESS:${HOLDER_ETHEREUM_ADDRESS}] : #done`)

	callback()
}
