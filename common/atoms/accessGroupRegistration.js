function AccessGroupRegistration(moduleContext) {
	const groupsAccessManager = moduleContext.groupsAccessManager

	this.createGroup = async (groupName, users, systemOwner = moduleContext.accounts[0]) => {
		if (!(await groupsAccessManager.isGroupExists.call(groupName))) {
			await groupsAccessManager.createGroup(groupName, 1, { from: systemOwner, })
		}

		for (var user of users) {
			if (!(await groupsAccessManager.isRegisteredUser.call(user))) {
				await groupsAccessManager.registerUser(user, { from: systemOwner, })
			}
		}

		await groupsAccessManager.addUsersToGroup(groupName, users, { from: systemOwner, })
	}

	this.removeFromGroup = async (groupName, users, systemOwner = moduleContext.accounts[0]) => {
		if (!(await groupsAccessManager.isGroupExists.call(groupName))) {
			return
		}

		if ((await groupsAccessManager.removeUsersFromGroup.call(groupName, users, { from: systemOwner, })).toNumber() === 1) {
			await groupsAccessManager.removeUsersFromGroup(groupName, users, { from: systemOwner, })
		}
	}
}

module.exports = AccessGroupRegistration