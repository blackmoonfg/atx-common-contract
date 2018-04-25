function PoliciesService(moduleContext, pendingFacade = moduleContext.pendingFacade) {

	const self = this

	this.addPolicyRuleForMethod = async (contract, signature, groupName, acceptanceLimit, decliningLimit) => {
		await pendingFacade.addExpandedPolicyRule(contract, signature, groupName, acceptanceLimit, decliningLimit)
	}

	this.addPolicyMultiRulesForMethod = async (contract, signature, groupNames, acceptanceLimits, decliningLimits) => {
		if (groupNames.length !== acceptanceLimits.length || groupNames.length !== decliningLimits.length) {
			throw `[${__filename}] Length of groups and limits should be equal`
		}

		for (var idx in groupNames) {
			await pendingFacade.addExpandedPolicyRule(contract, signature, groupNames[idx], acceptanceLimits[idx], decliningLimits[idx])
		}
	}

	/* Implementations */

	this.addPolicyForAddingBurningMan = async (assetServiceController, groupName, acceptanceLimit, decliningLimit) => {
		await self.addPolicyRuleForMethod(assetServiceController, assetServiceController.contract.addBurningMan.getData(0x0, 0), groupName, acceptanceLimit, decliningLimit)
	}

	this.addPolicyForRemovingBurningMan = async (assetServiceController, groupName, acceptanceLimit, decliningLimit) => {
		await self.addPolicyRuleForMethod(assetServiceController, assetServiceController.contract.removeBurningMan.getData(0x0, 0), groupName, acceptanceLimit, decliningLimit)
	}

	this.addPolicyForAddingEmissionProvider = async (assetServiceController, groupName, acceptanceLimit, decliningLimit) => {
		await self.addPolicyRuleForMethod(assetServiceController, assetServiceController.contract.addEmissionProvider.getData(0x0, 0), groupName, acceptanceLimit, decliningLimit)
	}

	this.addPolicyForRemovingEmissionProvider = async (assetServiceController, groupName, acceptanceLimit, decliningLimit) => {
		await self.addPolicyRuleForMethod(assetServiceController, assetServiceController.contract.removeEmissionProvider.getData(0x0, 0), groupName, acceptanceLimit, decliningLimit)
	}

	this.addPolicyForWithdrawingFromNonOperational = async (nonOperationalWithdrawManager, groupNames, acceptanceLimits, decliningLimits) => {
		await self.addPolicyMultiRulesForMethod(nonOperationalWithdrawManager, nonOperationalWithdrawManager.contract.withdraw.getData(0, 0x0, 0), groupNames, acceptanceLimits, decliningLimits)
	}

	this.addPolicyForUpdatingProfiterole = async (assetServiceController, groupName, acceptanceLimit, decliningLimit) => {
		await self.addPolicyRuleForMethod(assetServiceController, assetServiceController.contract.updateProfiterole.getData(0x0, 0), groupName, acceptanceLimit, decliningLimit)
	}

	this.addPolicyForUpdatingTreasury = async (assetServiceController, groupName, acceptanceLimit, decliningLimit) => {
		await self.addPolicyRuleForMethod(assetServiceController, assetServiceController.contract.updateTreasury.getData(0x0, 0), groupName, acceptanceLimit, decliningLimit)
	}

	this.addPolicyForUpdatingPendingManager = async (assetServiceController, groupName, acceptanceLimit, decliningLimit) => {
		await self.addPolicyRuleForMethod(assetServiceController, assetServiceController.contract.updatePendingManager.getData(0x0, 0), groupName, acceptanceLimit, decliningLimit)
	}

	this.addPolicyForServiceController = async (assetServiceController, groupName, acceptanceLimit, decliningLimit) => {
		await self.addPolicyForAddingBurningMan(assetServiceController, groupName, acceptanceLimit, decliningLimit)
		await self.addPolicyForRemovingBurningMan(assetServiceController, groupName, acceptanceLimit, decliningLimit)
		await self.addPolicyForAddingEmissionProvider(assetServiceController, groupName, acceptanceLimit, decliningLimit)
		await self.addPolicyForRemovingEmissionProvider(assetServiceController, groupName, acceptanceLimit, decliningLimit)
		await self.addPolicyForUpdatingProfiterole(assetServiceController, groupName, acceptanceLimit, decliningLimit)
		await self.addPolicyForUpdatingTreasury(assetServiceController, groupName, acceptanceLimit, decliningLimit)
		await self.addPolicyForUpdatingPendingManager(assetServiceController, groupName, acceptanceLimit, decliningLimit)
	}
}


module.exports = PoliciesService