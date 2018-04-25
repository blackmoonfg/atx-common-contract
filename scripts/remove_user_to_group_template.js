const contractsModuleContext = require("../common/context")
const GroupRegistration = require("../common/atoms/accessGroupRegistration")

module.exports = async callback => {
	const moduleContext = await contractsModuleContext(web3)
	const groupRegistration = new GroupRegistration(moduleContext)

	const GROUP_NAME = "[group name]"
	const usersToRemove = [] // TODO: put users' or contracts' addresses here

	await groupRegistration.removeFromGroup(GROUP_NAME, usersToRemove)

	console.log(`[${__filename}] ${GROUP_NAME} now has been removed ${usersToRemove} users: #done`)
	
	callback()
}