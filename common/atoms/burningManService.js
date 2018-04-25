const PendingFacade = require('bmc-contract/common/helpers/pending-facade')

function BurningManService(moduleContext, artifacts = moduleContext.artifacts) {
	const BurningMan = artifacts.require("BurningMan")
	const ServiceController = artifacts.require("ServiceController")
	const Profiterole = artifacts.require("Profiterole")
	const PendingManager = artifacts.require("PendingManager")

	const self = this

	this.createBurningMan = async (config, tokenContract, moderator, systemOwner = moduleContext.accounts[0], basePlatform = moduleContext.atxPlatform) => {
		const burningMan = await BurningMan.new.apply(this, config)
		const [ tokenServiceController, tokenProfiterole, pendingFacade, ] = await self.getTokenServices(tokenContract)

		await basePlatform.addAssetPartOwner(await tokenContract.smbl.call(), burningMan.address, { from: systemOwner, })
		await tokenProfiterole.addDistributionSources([burningMan.address,], { from: systemOwner, })

		let blockNumber
		if (moderator !== undefined &&
			moderator.user !== undefined &&
			moderator.user !== 0x0 &&
			moderator.group !== undefined
		) {
			await pendingFacade.acceptTx(moderator.user, moderator.group, async block => {
				blockNumber = block
				return await tokenServiceController.addBurningMan(burningMan.address, block)
			})
		}
		else {
			const tx = await tokenServiceController.addBurningMan(burningMan.address, 0, { from: systemOwner, })
			blockNumber = tx.receipt.blockNumber
		}

		return [ burningMan, blockNumber, ]
	}

	this.getTokenServices = async tokenContract => {
		const tokenBackend = await moduleContext.ATxAssetInterface.at(await tokenContract.getLatestVersion.call())
		const tokenServiceController = await ServiceController.at(await tokenBackend.serviceController.call())
		const tokenProfiterole = await Profiterole.at(await tokenServiceController.profiterole.call())
		const pendingManager = await PendingManager.at(await tokenServiceController.pendingManager.call())
		const pendingFacade = new PendingFacade(pendingManager, web3)

		return [ tokenServiceController, tokenProfiterole, pendingFacade, ]
	}
}


module.exports = BurningManService