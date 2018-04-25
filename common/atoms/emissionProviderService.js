const PendingFacade = require('bmc-contract/common/helpers/pending-facade')

function EmissionProviderService(moduleContext, artifacts = moduleContext.artifacts) {
	const EmissionProvider = artifacts.require("EmissionProvider")
	const ServiceController = artifacts.require("ServiceController")
	const Profiterole = artifacts.require("Profiterole")
	const PendingManager = artifacts.require("PendingManager")

	const self = this

	this.createEmissionProvider = async (config, tokenContract, moderator, systemOwner = moduleContext.accounts[0], basePlatform = moduleContext.atxPlatform) => {
		const emissionProvider = await EmissionProvider.new.apply(this, config, { from: systemOwner, })

		const [ tokenServiceController, tokenProfiterole, pendingFacade, ] = await self.getTokenServices(tokenContract)

		await basePlatform.addAssetPartOwner(await tokenContract.smbl.call(), emissionProvider.address, { from: systemOwner, })
		await tokenProfiterole.addDistributionSources([emissionProvider.address,], { from: systemOwner, })

		let blockNumber
		if (moderator !== undefined &&
			moderator.user !== undefined &&
			moderator.user !== 0x0 &&
			moderator.group !== undefined
		) {
			await pendingFacade.acceptTx(moderator.user, moderator.group, async block => {
				blockNumber = block
				return await tokenServiceController.addEmissionProvider(emissionProvider.address, block)
			})
		}
		else {
			const tx = await tokenServiceController.addEmissionProvider(emissionProvider.address, 0, { from: systemOwner, })
			blockNumber = tx.receipt.blockNumber
		}

		return [ emissionProvider, blockNumber, ]
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

module.exports = EmissionProviderService