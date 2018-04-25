const error = require('bmc-contract/common/errors')
const eventsHelper = require('bmc-contract/common/helpers/eventsHelper')
const toBytes32 = require('bmc-contract/common/helpers/bytes32')
const Setup = require('../setup/setup')

contract('DataController', accounts => {

	const INT_BIG_VALUE = 2**32

	const setup = new Setup()

	const systemOwner = accounts[0]
	const account1 = accounts[1]
	const account2 = accounts[3]
	const account3 = accounts[4]
	const account4 = accounts[5]
	const oracle1 = accounts[6]
	const oracle2 = accounts[7]

	let scope

	const addOraclesExceptOne = async (dataController, oracle, exceptionMethodName) => {
		const methods = [
			[ "registerHolder", dataController.contract.registerHolder.getData(0x0, 0x0, 0).slice(0, 10), ],
			[ "addHolderAddress", dataController.contract.addHolderAddress.getData(0x0, 0x0).slice(0, 10), ],
			[ "removeHolderAddress", dataController.contract.removeHolderAddress.getData(0x0, 0x0).slice(0, 10), ],
			[ "changeOperational", dataController.contract.changeOperational.getData(0x0, false).slice(0, 10), ],
			[ "updateTextForHolder", dataController.contract.updateTextForHolder.getData(0x0, "").slice(0, 10), ],
			[ "updateLimitPerDay", dataController.contract.updateLimitPerDay.getData(0x0, 0).slice(0, 10), ],
			[ "updateLimitPerMonth", dataController.contract.updateLimitPerMonth.getData(0x0, 0).slice(0, 10), ],
			[ "changeCountryLimit", dataController.contract.changeCountryLimit.getData(0, 0).slice(0, 10), ],
		]

		const params = methods
			.filter(method => method[0] !== exceptionMethodName)
			.reduce((acc, method) => {
				acc.signatures.push(method[1])
				acc.oracles.push(oracle)
				return acc
			}, { signatures: [], oracles: [], })

		await dataController.addOracles(params.signatures, params.oracles, { from: systemOwner, })
	}

	before('Before', async () => {
		await setup.snapshot()
		await setup.beforeAll()
		await setup.snapshot()

		scope = setup.token[0]
	})

	after("cleanup", async () => {
		await setup.revert(INT_BIG_VALUE)
	})

	context("oracles", () => {
		before(async () => {

		})

		after(async () => {
			await setup.revert()
		})

		it("should not be possible to add oracle by non-contract owner with UNAUTHORIZED code", async () => {
			
		})

		it("should not be possible to add oracle by non-contract owner", async () => {

		})
		
		it("should not be possible to add oracle by contract owner with OK code", async () => {
			
		})

		it("should not be possible to add oracle by contract owner", async () => {
			
		})

		it("should not be possible to add other oracle by contract owner", async () => {
			
		})

		it("should have both oracles saved in data controller", async () => {

		})

		it("should not be possible to remove oracle by non-contract owner with UNAUTHORIZED code", async () => {
			
		})

		it("should not be possible to remove oracle by non-contract owner", async () => {

		})
		
		it("should be possible to remove oracle by contract owner with OK code", async () => {
			
		})

		it("should be possible to remove oracle by contract owner", async () => {
			
		})

		it("should have only one oracle left", async () => {

		})
	})

	function generateTestCaseContext(doBeforeAll, caseName, methodName, getDataController, getMethodSig, datas, methodCallInvocation, methodInvocation, checkPresenceExpect) {
		context(`${caseName}`, () => {
			const oracle = oracle1
			let contextDataController
			let methodSig

			before(async () => {
				contextDataController = getDataController()
				methodSig = getMethodSig()

				await doBeforeAll({ from: systemOwner, datas: datas, controller: contextDataController, })
				await addOraclesExceptOne(contextDataController, oracle, `${methodName}`)
				await addOraclesExceptOne(contextDataController, oracle2, `${methodName}`)
			})

			after(async () => {
				await setup.revert()
			})

			it("should not have future oracle being added as oracle", async () => {
				assert.isFalse(await contextDataController.oracles.call(methodSig, oracle))
			})

			it(`should not be able to ${caseName} by non-oracle or non-contract owner with UNAUTHORIZED code`, async () => {
				assert.equal(await methodCallInvocation({ from: oracle, data: datas[0], controller: contextDataController, }), error.UNAUTHORIZED)
			})

			it(`should not be able to ${caseName} by non-oracle or non-contract owner`, async () => {
				await methodInvocation({ from: oracle, data: datas[0], controller: contextDataController, })
				await checkPresenceExpect({ expect: false, data: datas[0], controller: contextDataController, })
			})

			it(`should be able to add oracle for ${methodName} method`, async () => {
				await contextDataController.addOracles([methodSig,], [oracle,], { from: systemOwner, })
				assert.isTrue(await contextDataController.oracles.call(methodSig, oracle))
			})

			it(`should allow to ${caseName} by contract owner with OK code`, async () => {
				assert.equal(await methodCallInvocation({ from: systemOwner, data: datas[0], controller: contextDataController, }), error.OK)
			})

			it(`should allow to ${caseName} by contract owner`, async () => {
				await methodInvocation({ from: systemOwner, data: datas[0], controller: contextDataController, })
				await checkPresenceExpect({ expect: true, data: datas[0], controller: contextDataController, })
			})

			it(`should allow to ${caseName} by oracle with OK code`, async () => {
				assert.equal(await methodCallInvocation({ from: oracle, data: datas[1], controller: contextDataController, }), error.OK)
			})

			it(`should allow to ${caseName} by oracle`, async () => {
				await methodInvocation({ from: oracle, data: datas[1], controller: contextDataController, })
				await checkPresenceExpect({ expect: true, data: datas[1], controller: contextDataController, })
			})

			it(`should not allow to ${caseName} by other oracle`, async () => {
				await methodInvocation({ from: oracle2, data: datas[2], controller: contextDataController, })
				await checkPresenceExpect({ expect: false, data: datas[2], controller: contextDataController, })
			})
		})
	}

	context("protected by oracles (or contract owner) methods", () => {
		const testCasesData = [
			[
				() => {},
				"register holder",
				"registerHolder",
				() => scope.DataController,
				() => scope.DataController.contract.registerHolder.getData(0x0, 0x0, 0).slice(0, 10),
				[
					{
						externalHolderId: "0x111111",
						ethereumHolderAddress: account1,
						countryCode: 2,
					},
					{
						externalHolderId: "0x222222",
						ethereumHolderAddress: account2,
						countryCode: 2,
					},
					{
						externalHolderId: "0x333333",
						ethereumHolderAddress: account3,
						countryCode: 2,
					},
				],
				async params => {
					return (await params.controller.registerHolder.call(params.data.externalHolderId, params.data.ethereumHolderAddress, params.data.countryCode, { from: params.from, })).toNumber()
				},
				async params => {
					await params.controller.registerHolder(params.data.externalHolderId, params.data.ethereumHolderAddress, params.data.countryCode, { from: params.from, })
				},
				async params => {
					let expectation
					if (params.expect) {
						expectation = assert.equal
					}
					else {
						expectation = assert.notEqual
					}

					const [countryCode,] = await params.controller.getHolderInfo.call(params.data.externalHolderId)
					expectation(params.data.countryCode, countryCode.toNumber())
					expectation(await params.controller.getHolderExternalIdByAddress.call(params.data.ethereumHolderAddress), toBytes32(params.data.externalHolderId))
					assert(params.expect === await params.controller.isHolderOwnAddress.call(params.data.externalHolderId, params.data.ethereumHolderAddress))
				},
			],
			[
				async params => {
					await params.controller.registerHolder(params.datas[0].externalHolderId, account1, 3, { from: params.from, })
				},
				"add holder address",
				"addHolderAddress",
				() => scope.DataController,
				() => scope.DataController.contract.addHolderAddress.getData(0, 0).slice(0, 10),
				[
					{
						externalHolderId: "0x111111",
						ethereumHolderAddress: account2,
					},
					{
						externalHolderId: "0x111111",
						ethereumHolderAddress: account3,
					},
					{
						externalHolderId: "0x111111",
						ethereumHolderAddress: account4,
					},
				],
				async params => {
					return (await params.controller.addHolderAddress.call(params.data.externalHolderId, params.data.ethereumHolderAddress, { from: params.from, })).toNumber()
				},
				async params => {
					await params.controller.addHolderAddress(params.data.externalHolderId, params.data.ethereumHolderAddress, { from: params.from, })
				},
				async params => {
					let expectation
					let expectInclude
					if (params.expect) {
						expectation = assert.equal
						expectInclude = assert.include
					}
					else {
						expectation = assert.notEqual
						expectInclude = assert.notInclude
					}

					expectation(await params.controller.getHolderExternalIdByAddress.call(params.data.ethereumHolderAddress), toBytes32(params.data.externalHolderId))
					assert(params.expect === await params.controller.isHolderOwnAddress.call(params.data.externalHolderId, params.data.ethereumHolderAddress))
					const addresses = await params.controller.getHolderAddresses.call(params.data.externalHolderId)
					expectInclude(addresses, params.data.ethereumHolderAddress)
				},
			],
			[
				async params => {
					await params.controller.registerHolder(params.datas[0].externalHolderId, params.datas[0].ethereumHolderAddress, 3, { from: params.from, })
					await params.controller.addHolderAddress(params.datas[1].externalHolderId, params.datas[1].ethereumHolderAddress, { from: params.from, })
					await params.controller.addHolderAddress(params.datas[2].externalHolderId, params.datas[2].ethereumHolderAddress, { from: params.from, })
				},
				"remove holder address",
				"removeHolderAddress",
				() => scope.DataController,
				() => scope.DataController.contract.removeHolderAddress.getData(0, 0).slice(0, 10),
				[
					{
						externalHolderId: "0x111111",
						ethereumHolderAddress: account1,
					},
					{
						externalHolderId: "0x111111",
						ethereumHolderAddress: account2,
					},
					{
						externalHolderId: "0x111111",
						ethereumHolderAddress: account3,
					},
				],
				async params => {
					return (await params.controller.removeHolderAddress.call(params.data.externalHolderId, params.data.ethereumHolderAddress, { from: params.from, })).toNumber()
				},
				async params => {
					await params.controller.removeHolderAddress(params.data.externalHolderId, params.data.ethereumHolderAddress, { from: params.from, })
				},
				async params => {
					let expectation
					let expectInclude
					if (params.expect) {
						expectation = assert.notEqual
						expectInclude = assert.notInclude
					}
					else {
						expectation = assert.equal
						expectInclude = assert.include
					}

					expectation(await params.controller.getHolderExternalIdByAddress.call(params.data.ethereumHolderAddress), toBytes32(params.data.externalHolderId))
					assert(!params.expect === await params.controller.isHolderOwnAddress.call(params.data.externalHolderId, params.data.ethereumHolderAddress))
					const addresses = await params.controller.getHolderAddresses.call(params.data.externalHolderId)
					expectInclude(addresses, params.data.ethereumHolderAddress)
				},
			],
			[
				async params => {
					await params.controller.registerHolder(params.datas[0].externalHolderId, params.datas[0].ethereumHolderAddress, 3, { from: params.from, })
					await params.controller.registerHolder(params.datas[1].externalHolderId, params.datas[1].ethereumHolderAddress, 3, { from: params.from, })
					await params.controller.registerHolder(params.datas[2].externalHolderId, params.datas[2].ethereumHolderAddress, 3, { from: params.from, })
				},
				"change operational",
				"changeOperational",
				() => scope.DataController,
				() => scope.DataController.contract.changeOperational.getData(0, false).slice(0, 10),
				[
					{
						externalHolderId: "0x111111",
						ethereumHolderAddress: account1,
					},
					{
						externalHolderId: "0x222222",
						ethereumHolderAddress: account2,
					},
					{
						externalHolderId: "0x333333",
						ethereumHolderAddress: account3,
					},
				],
				async params => {
					return (await params.controller.changeOperational.call(params.data.externalHolderId, false, { from: params.from, })).toNumber()
				},
				async params => {
					await params.controller.changeOperational(params.data.externalHolderId, false, { from: params.from, })
				},
				async params => {
					let expectation
					if (params.expect) {
						expectation = assert.isFalse
					}
					else {
						expectation = assert.isTrue
					}

					const [ ,,, isOperational, ] = await params.controller.getHolderInfo.call(params.data.externalHolderId)
					expectation(isOperational)
				},
			],
			[
				async params => {
					await params.controller.registerHolder(params.datas[0].externalHolderId, account1, 3, { from: params.from, })
				},
				"update text for holder",
				"updateTextForHolder",
				() => scope.DataController,
				() => scope.DataController.contract.updateTextForHolder.getData(0x0, []).slice(0, 10),
				[
					{
						externalHolderId: "0x111111",
						text: "my little pony",
					},
					{
						externalHolderId: "0x111111",
						text: "catch me if you can",
					},
					{
						externalHolderId: "0x111111",
						text: "gazzzaa",
					},
				],
				async params => {
					return (await params.controller.updateTextForHolder.call(params.data.externalHolderId, params.data.text, { from: params.from, })).toNumber()
				},
				async params => {
					await params.controller.updateTextForHolder(params.data.externalHolderId, params.data.text, { from: params.from, })
				},
				async params => {
					let expectation
					if (params.expect) {
						expectation = assert.equal
					}
					else {
						expectation = assert.notEqual
					}

					const [ ,,,, text, ] = await params.controller.getHolderInfo.call(params.data.externalHolderId)
					expectation(params.data.text, web3.toAscii(text))
				},
			],
			[
				async params => {
					await params.controller.registerHolder(params.datas[0].externalHolderId, account1, 3, { from: params.from, })
				},
				"update limits per day",
				"updateLimitPerDay",
				() => scope.DataController,
				() => scope.DataController.contract.updateLimitPerDay.getData(0x0, 0).slice(0, 10),
				[
					{
						externalHolderId: "0x111111",
						limit: 100,
					},
					{
						externalHolderId: "0x111111",
						limit: 900,
					},
					{
						externalHolderId: "0x111111",
						limit: 200,
					},
				],
				async params => {
					return (await params.controller.updateLimitPerDay.call(params.data.externalHolderId, params.data.limit, { from: params.from, })).toNumber()
				},
				async params => {
					await params.controller.updateLimitPerDay(params.data.externalHolderId, params.data.limit, { from: params.from, })
				},
				async params => {
					let expectation
					if (params.expect) {
						expectation = assert.equal
					}
					else {
						expectation = assert.notEqual
					}

					const [ , limitPerDay, ] = await params.controller.getHolderInfo.call(params.data.externalHolderId)
					expectation(params.data.limit, limitPerDay)
				},
			],
			[
				async params => {
					await params.controller.registerHolder(params.datas[0].externalHolderId, account1, 3, { from: params.from, })
				},
				"update limits per month",
				"updateLimitPerMonth",
				() => scope.DataController,
				() => scope.DataController.contract.updateLimitPerMonth.getData(0x0, 0).slice(0, 10),
				[
					{
						externalHolderId: "0x111111",
						limit: 10000,
					},
					{
						externalHolderId: "0x111111",
						limit: 90000,
					},
					{
						externalHolderId: "0x111111",
						limit: 20000,
					},
				],
				async params => {
					return (await params.controller.updateLimitPerMonth.call(params.data.externalHolderId, params.data.limit, { from: params.from, })).toNumber()
				},
				async params => {
					await params.controller.updateLimitPerMonth(params.data.externalHolderId, params.data.limit, { from: params.from, })
				},
				async params => {
					let expectation
					if (params.expect) {
						expectation = assert.equal
					}
					else {
						expectation = assert.notEqual
					}

					const [ ,, limitPerMonth, ] = await params.controller.getHolderInfo.call(params.data.externalHolderId)
					expectation(params.data.limit, limitPerMonth)
				},
			],
			[
				async params => {
					await params.controller.addCountryCode(params.datas[0].countryCode, { from: params.from, })
				},
				"change country limit",
				"changeCountryLimit",
				() => scope.DataController,
				() => scope.DataController.contract.changeCountryLimit.getData(0, 0).slice(0, 10),
				[
					{
						externalHolderId: "0x111111",
						countryCode: 2,
						limit: 100,
					},
					{
						externalHolderId: "0x111111",
						countryCode: 2,
						limit: 900,
					},
					{
						externalHolderId: "0x111111",
						countryCode: 2,
						limit: 200,
					},
				],
				async params => {
					return (await params.controller.changeCountryLimit.call(params.data.countryCode, params.data.limit, { from: params.from, })).toNumber()
				},
				async params => {
					await params.controller.changeCountryLimit(params.data.countryCode, params.data.limit, { from: params.from, })
				},
				async params => {
					let expectation
					if (params.expect) {
						expectation = assert.equal
					}
					else {
						expectation = assert.notEqual
					}

					expectation((await params.controller.getCountryLimit.call(params.data.countryCode)).toNumber(), params.data.limit)
				},
			],
		]

		for (var testCase of testCasesData) {
			generateTestCaseContext.apply(this, testCase)
		}
	})
})
