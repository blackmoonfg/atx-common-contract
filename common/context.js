const contract = require("truffle-contract")

const Reverter = require('bmc-contract/common/helpers/reverter')
const TimeMachine = require('bmc-contract/common/helpers/timemachine')
const PendingFacade = require('bmc-contract/common/helpers/pending-facade')

const BMCPlatform = contract(require('bmc-contract/build/contracts/BMCPlatform'))
const BMCProxy = contract(require('bmc-contract/build/contracts/BMCAssetProxy'))

const ATxPlatform = contract(require('bmc-contract/build/contracts/ATxPlatform'))
const MultiEventsHistory = contract(require('bmc-contract/build/contracts/MultiEventsHistory'))
const ATxAssetInterface = contract(require('bmc-contract/build/contracts/ATxAssetInterface'))
const GroupsAccessManager = contract(require('bmc-contract/build/contracts/GroupsAccessManager'))
const PendingManager = contract(require('bmc-contract/build/contracts/PendingManager'))
const Withdrawal = contract(require('bmc-contract/build/contracts/NonOperationalWithdrawManager'))

// Test contracts
const ATxPlatformServiceAllowanceTestable = contract(require('bmc-contract/build/contracts/ATxPlatformServiceAllowanceTestable'))
const TokenSender = contract(require('bmc-contract/build/contracts/TokenSender'))

function getAccounts(web3) {
	return new Promise((resolve, reject) => web3.eth.getAccounts((err, acc) => {
		if (err) {
			reject(err)
		}
		resolve(acc)
	}))
}

function initModuleContracts(web3, defaults) {
	[
		BMCPlatform,
		BMCProxy,
		MultiEventsHistory,
		ATxPlatform,
		ATxAssetInterface,
		PendingManager,
		Withdrawal,
		GroupsAccessManager,

		// Test contracts
		ATxPlatformServiceAllowanceTestable,
		TokenSender,
	].forEach(remoteContract => {
		remoteContract.setProvider(web3.currentProvider)
		remoteContract.defaults(defaults)
	})
}


const setup = async (web3, artifacts = artifacts, reverter = new Reverter(web3)) => {
	const Migrations = artifacts.require("Migrations")
	const truffleContractDefaults = Migrations.defaults()

	initModuleContracts(web3, truffleContractDefaults)

	var results = {
		accounts: await getAccounts(web3),
		reverter: reverter,
		timeMachine: new TimeMachine(web3),
		pendingFacade: new PendingFacade(await PendingManager.deployed(), web3),
		artifacts: artifacts,

		// contracts
		bmcPlatform: await BMCPlatform.deployed(),
		bmcToken: await BMCProxy.deployed(),
		eventsHistory: await MultiEventsHistory.deployed(),
		atxPlatform: await ATxPlatform.deployed(),
		ATxAssetInterface: ATxAssetInterface,
		groupsAccessManager: await GroupsAccessManager.deployed(),
		pendingManager: await PendingManager.deployed(),
		PendingManager: PendingManager,
		nonOperationalWithdrawManager: await Withdrawal.deployed(),
	}

	const testContracts = [{
		key: "atxPlatformServiceAllowanceTestable",
		contract: ATxPlatformServiceAllowanceTestable,
	}, {
		key: "tokenSender",
		contract: TokenSender,
	},]

	for (var entity of testContracts) {
		if (entity.contract.hasNetwork(web3.version.network)) {
			console.log(`${entity.key} has been deployed to network "${web3.version.network}"`)
			results[entity.key] = await entity.contract.deployed()
		}
		else {
			console.log(`${entity.key} has not been found in network "${web3.version.network}". Leave it undefined`)
			results[entity.key] = undefined
		}
	}

	return results
}

module.exports = setup