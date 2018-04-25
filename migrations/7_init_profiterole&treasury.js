const ProfiteroleWallet = artifacts.require('ProfiteroleWallet')
const Profiterole = artifacts.require('Profiterole')
const Treasury = artifacts.require('Treasury')
const path = require("path")

module.exports = deployer => {
	deployer.then(async () => {
		const treasury = await Treasury.deployed()
		await treasury.init(Profiterole.address)

		const wallet = await ProfiteroleWallet.deployed()
		await wallet.init(Profiterole.address)

		console.log("[MIGRATION] [" + parseInt(path.basename(__filename)) + "] Profiterole & Treasury init: #done")
	})
}
