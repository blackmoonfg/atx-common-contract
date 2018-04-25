const utils = require('bmc-contract/common/helpers/utils')
const Setup = require('./../setup/setup')

contract('ATx Asset', accounts => {

	const INT_BIG_NUMBER = 2**32

	const setup = new Setup()

	const systemOwner = accounts[0]
	const account1 = accounts[1]
	const account2 = accounts[2]

	const balances = [ 1000, 1500, ]

	before('Before', async() => {
		await setup.snapshot()
		await setup.beforeAll()

		await setup.ATxPlatform.massTransfer([ account1, account2, ], balances, await setup.ATxProxy.smbl(), { from: systemOwner, })

		await setup.DataController.registerHolder("0x11111", account1, 1)
		await setup.DataController.registerHolder("0x22222", account2, 1)

		await setup.snapshot()
	})

	after("cleanup", async () => {
		await setup.revert(INT_BIG_NUMBER)
	})

	it("should have initial balances", async () => {
		assert.equal((await setup.ATxProxy.balanceOf.call(account1)).toNumber(), balances[0])
		assert.equal((await setup.ATxProxy.balanceOf.call(account2)).toNumber(), balances[1])
	})

	it('should revert while init', async() => {
		const lockupDate = await setup.timeMachine.getFutureTime(1000)

		await test(utils.zeroAddress, setup.ServiceController.address, setup.DataController.address, lockupDate)
		await test(setup.ATxProxy.address, utils.zeroAddress, setup.DataController.address, lockupDate)
		await test(setup.ATxProxy.address, setup.ServiceController.address, utils.zeroAddress, lockupDate)

		async function test(proxy, service, data, lockup) {
			try {
				await setup.ATxAsset.initAtx.call(proxy, service, data, lockup)
				assert(false, "didn't throw")
			}
			catch (e) {
				utils.ensureRevert(e)
			}
		}
	})

	context("simple transfer", () => {

		before(async () => {
			await setup.timeMachine.jumpDaysForward(2)
		})

		it('should transfer tokens without taking any fee', async() => {
			const amount = 100
			const acc1BeforeBalance = (await setup.ATxProxy.balanceOf(account1)).toNumber()
			const acc2BeforeBalance = (await setup.ATxProxy.balanceOf(account2)).toNumber()

			const result = await setup.ATxProxy.transfer.call(account2, amount, { from: account1, })
			assert.isTrue(result)
			await setup.ATxProxy.transfer(account2, amount, { from: account1, })

			const withdrawnSum = amount
			const acc1AfterBalance = (await setup.ATxProxy.balanceOf.call(account1)).toNumber()
			assert.equal(acc1AfterBalance, acc1BeforeBalance - withdrawnSum)

			const acc2AfterBalance = (await setup.ATxProxy.balanceOf.call(account2)).toNumber()
			assert.equal(acc2AfterBalance, acc2BeforeBalance + amount)
		})

		it('should transfer tokens (through allowance) without taking any fee', async() => {
			const amount = 100
			const acc1BeforeBalance = (await setup.ATxProxy.balanceOf.call(account1)).toNumber()
			const acc2BeforeBalance = (await setup.ATxProxy.balanceOf.call(account2)).toNumber()

			const result = await setup.ATxProxy.transferFrom.call(account1, account2, amount, { from: account1, })
			assert.isTrue(result)
			await setup.ATxProxy.transferFrom(account1, account2, amount, { from: account1, })

			const acc1AfterBalance = (await setup.ATxProxy.balanceOf.call(account1)).toNumber()
			const withdrawnSum = amount
			assert.equal(acc1AfterBalance, acc1BeforeBalance - withdrawnSum)

			const acc2AfterBalance = (await setup.ATxProxy.balanceOf.call(account2)).toNumber()
			assert.equal(acc2AfterBalance, acc2BeforeBalance + amount)
		})
	})
})
