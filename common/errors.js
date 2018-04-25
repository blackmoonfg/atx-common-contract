const errorScope = {
	profiterole: 102000,
	burningman: 104000,
	emissionprovider: 107000,
	treasury: 108000,
	datacontroller: 109000,
}

const errorsLibrary = {
	UNAUTHORIZED: 0,
	OK: 1,
	NO_RECORDS_WERE_FOUND: 2,
	MULTISIG_ADDED: 3,
	UNDEFINED: 0xDEFDEFDEF,
	OBJECT_ACCESS_DENIED_CONTRACT_OWNER_ONLY: 8,

	PROFITEROLE_INSUFFICIENT_DISTRIBUTION_BALANCE: errorScope.profiterole + 1,
	PROFITEROLE_ERROR_INSUFFICIENT_BONUS_BALANCE: errorScope.profiterole + 2,
	PROFITEROLE_TRANSFER_ERROR: errorScope.profiterole + 3,

	BURNING_MAN_INSUFFICIENT_FUNDS: errorScope.burningman + 1,
	BURNING_MAN_NOT_ENOUGH_ALLOWANCE: errorScope.burningman + 2,
	BURNING_MAN_ERROR_WHILE_TOKEN_TRANSFER: errorScope.burningman + 3,
	BURNING_MAN_WRONG_STATE: errorScope.burningman + 4,
	BURNING_MAN_INSUFFICIENT_BONUS_TOKEN_FUNDS: errorScope.burningman + 5,

	EMISSION_PROVIDER_WRONG_STATE: errorScope.emissionprovider + 1,
	EMISSION_PROVIDER_INSUFFICIENT_BMC: errorScope.emissionprovider + 2,
	EMISSION_PROVIDER_INTERNAL: errorScope.emissionprovider + 3,

	TREASURY_TOKEN_NOT_SET_ALLOWANCE: errorScope.treasury + 1,

	DATA_CONTROLLER_ERROR: errorScope.datacontroller + 1,
	DATA_CONTROLLER_CURRENT_WRONG_LIMIT: errorScope.datacontroller + 2,
	DATA_CONTROLLER_WRONG_ALLOWANCE: errorScope.datacontroller + 3,
	DATA_CONTROLLER_COUNTRY_CODE_ALREADY_EXISTS: errorScope.datacontroller + 4,
}

module.exports = errorsLibrary
