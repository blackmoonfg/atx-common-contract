const setup = require('../setup/setup')
const error = require('../../common/errors.js')
const utils = require('bmc-contract/common/helpers/utils')

contract('Treasury Controller', accounts => {

	const INT_BIG_NUMBER = 2**32

	const Setup = new setup()
	Setup.init()

	const PERCENT_PRECISION = 10000
	const ONE_DAY = 24 * 60 * 60

	const owner = accounts[0]
	const oracle = accounts[3]
	const distributionSource = accounts[3]
	const account1Id = web3.sha3("1" + "1")
	const account2Id = web3.sha3("1" + "2")
	const feeAccount = accounts[1]

	before('Before', async () => {
		await Setup.snapshot()
		await Setup.beforeAll()
		await Setup.Treasury.init(distributionSource, { from: owner, })
		await Setup.snapshot()
	})

	after("cleanup", async () => {
		await Setup.revert(INT_BIG_NUMBER)
	})

	context("transfers", () => {
		describe("deposit", () => {
			it("Should be possible to deposit without fee", async () => {
				const deposit = 100

				await Setup.BMCProxy.transfer(oracle, deposit, { from: owner, })
				await Setup.BMCProxy.approve(Setup.Treasury.address, deposit, { from: oracle, })

				const addOracleResultCode = await Setup.Treasury.addOracles.call([oracle,], { from: owner, })
				assert.equal(addOracleResultCode, error.OK)

				await Setup.Treasury.addOracles([oracle,], { from: owner, })
				assert.equal(await Setup.BMCProxy.balanceOf.call(Setup.Treasury.address), 0)

				const depositCode = await Setup.Treasury.deposit.call(account1Id, deposit, 0, 0x0, 0, { from: oracle, })
				assert.equal(depositCode.toNumber(), error.OK)

				await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, 0, { from: oracle, })

				assert.equal(await Setup.BMCProxy.balanceOf.call(Setup.Treasury.address), deposit)
			})

			it("Should be possible to deposit with fee", async () => {
				const depositAmount = 100
				const feeAmount = 30
				const feeAccount = accounts[9]

				await Setup.BMCProxy.transfer(oracle, depositAmount, { from: owner, })
				await Setup.BMCProxy.approve(Setup.Treasury.address, depositAmount, { from: oracle, })
				await Setup.Treasury.addOracles([oracle,], { from: owner, })

				assert.equal(await Setup.BMCProxy.balanceOf.call(Setup.Treasury.address), 0)

				const depositCode = await Setup.Treasury.deposit.call(account1Id, depositAmount, feeAmount, feeAccount, 0, { from: oracle, })
				assert.equal(depositCode, error.OK)

				await Setup.Treasury.deposit(account1Id, depositAmount, feeAmount, feeAccount, 0, { from: oracle, })
				assert.equal((await Setup.BMCProxy.balanceOf.call(Setup.Treasury.address)).toNumber(), depositAmount - feeAmount)
				assert.equal((await Setup.BMCProxy.balanceOf.call(feeAccount)).toNumber(), feeAmount)
			})
		})

		describe("withdraw", () => {
			describe("without locked deposits", async () => {
				it("should be possible to withdraw without fee", async () => {
					const deposit = 100
					const withdraw = 50

					await Setup.BMCProxy.transfer(oracle, deposit, { from: owner, })
					await Setup.BMCProxy.approve(Setup.Treasury.address, deposit, { from: oracle, })
					await Setup.Treasury.addOracles([oracle,], { from: owner, })
					await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, 0, { from: oracle, })
					const oracleBalanceBefore = (await Setup.BMCProxy.balanceOf.call(oracle)).toNumber()
					assert.equal(await Setup.BMCProxy.balanceOf.call(Setup.Treasury.address), deposit)

					const withdrawCode = await Setup.Treasury.withdraw.call(account1Id, withdraw, oracle, 0, 0x0, { from: oracle, })

					assert.equal(withdrawCode, error.OK)
					await Setup.timeMachine.jumpDaysForward(2)
					await Setup.Treasury.withdraw(account1Id, withdraw, oracle, 0, 0x0, { from: oracle, })
					await Setup.timeMachine.jumpDaysForward(2)

					assert.equal(await Setup.BMCProxy.balanceOf.call(oracle), oracleBalanceBefore + withdraw)
				})

				it("should be possible to withdraw with fee", async () => {
					const deposit = 100
					const withdraw = 50
					const withdrawFeeAmount = 30

					await Setup.BMCProxy.transfer(oracle, deposit, { from: owner, })
					await Setup.BMCProxy.approve(Setup.Treasury.address, deposit, { from: oracle, })
					await Setup.Treasury.addOracles([oracle,], { from: owner, })
					await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, 0, { from: oracle, })

					const oracleBalanceBefore = (await Setup.BMCProxy.balanceOf.call(oracle)).toNumber()
					assert.equal(await Setup.BMCProxy.balanceOf.call(Setup.Treasury.address), deposit)

					const withdrawCode = await Setup.Treasury.withdraw.call(account1Id, withdraw, oracle, withdrawFeeAmount, feeAccount, { from: oracle, })
					assert.equal(withdrawCode, error.OK)

					await Setup.timeMachine.jumpDaysForward(2)
					await Setup.Treasury.withdraw(account1Id, withdraw, oracle, withdrawFeeAmount, feeAccount, { from: oracle, })
					await Setup.timeMachine.jumpDaysForward(2)

					assert.equal((await Setup.BMCProxy.balanceOf.call(oracle)).toNumber(), oracleBalanceBefore + (withdraw - withdrawFeeAmount))
					assert.equal((await Setup.BMCProxy.balanceOf.call(feeAccount)).toNumber(), withdrawFeeAmount)
				})
			})

			describe("with locked deposits", () => {
				it("should be able to get full deposits sum after single lockup date", async () => {
					const deposit = 100
					const withdraw = 100
					const currentTime = await Setup.timeMachine.getCurrentTime()

					await Setup.BMCProxy.transfer(oracle, deposit * 2, { from: owner, })
					await Setup.BMCProxy.approve(Setup.Treasury.address, deposit * 2, { from: oracle, })
					await Setup.Treasury.addOracles([oracle,], { from: owner, })
					await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, 0, { from: oracle, })
					await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, currentTime + 50 * 24 * 60 * 60, { from: oracle, })
					await Setup.timeMachine.jumpDaysForward(1)
					await Setup.Treasury.addDistributionPeriod({ from: distributionSource, })
					await Setup.timeMachine.jumpDaysForward(1)

					assert.equal((await Setup.Treasury.withdraw.call(account1Id, withdraw, oracle, 0, 0x0, { from: oracle, })).toNumber(), error.OK)
				})

				it("should be able to get full deposits sum after several lockup dates", async () => {
					const deposit = 100
					const withdraw = 100
					const currentTime = await Setup.timeMachine.getCurrentTime()

					await Setup.BMCProxy.transfer(oracle, deposit * 2, { from: owner, })
					await Setup.BMCProxy.approve(Setup.Treasury.address, deposit * 2, { from: oracle, })
					await Setup.Treasury.addOracles([oracle,], { from: owner, })
					await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, 0, { from: oracle, })
					await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, currentTime + 6 * 24 * 60 * 60, { from: oracle, })
					await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, currentTime + 50 * 24 * 60 * 60, { from: oracle, })
					await Setup.timeMachine.jumpDaysForward(5)
					await Setup.Treasury.addDistributionPeriod({ from: distributionSource, })
					await Setup.timeMachine.jumpDaysForward(1)

					assert.equal((await Setup.Treasury.withdraw.call(account1Id, 2 * withdraw, oracle, 0, 0x0, { from: oracle, })).toNumber(), error.OK)
				})

				it("should be able to get full deposits after several deposits with the same lockup date", async () => {
					const deposits = [ 100, 250, 1000, ]
					const withdraw = 400
					const currentTime = await Setup.timeMachine.getCurrentTime()
					const totalDepositsSum = deposits.reduce((acc, deposit) => {
						return acc + deposit
					}, 0)
					const daysLong = 50
					const lockupDates = [ 0, currentTime + daysLong * ONE_DAY, currentTime + daysLong * ONE_DAY, ]

					await Setup.BMCProxy.transfer(oracle, totalDepositsSum, { from: owner, })
					await Setup.BMCProxy.approve(Setup.Treasury.address, totalDepositsSum, { from: oracle, })
					await Setup.Treasury.addOracles([oracle,], { from: owner, })

					for (var depositIdx in deposits) {
						await Setup.Treasury.deposit(account1Id, deposits[depositIdx], 0, 0x0, lockupDates[depositIdx], { from: oracle, })
					}

					await Setup.timeMachine.jumpDaysForward(1)
					await Setup.Treasury.addDistributionPeriod({ from: distributionSource, })
					await Setup.timeMachine.jumpDaysForward(1)

					assert.equal(await Setup.Treasury.getLockedUserBalance.call(account1Id), totalDepositsSum - deposits[0])
					try {
						await Setup.Treasury.withdraw.call(account1Id, withdraw, oracle, 0, 0x0, { from: oracle, })
						assert.isTrue(false)
					}
					catch (e) {
						utils.ensureRevert(e)
					}

					assert.equal(await Setup.Treasury.withdraw.call(account1Id, deposits[0], oracle, 0, 0x0, { from: oracle, }), error.OK)

					await Setup.timeMachine.jumpDaysForward(daysLong)

					try {
						assert.equal(await Setup.Treasury.withdraw.call(account1Id, totalDepositsSum, oracle, 0, 0x0, { from: oracle, }), error.OK)
					}
					catch (e) {
						assert.isTrue(false)
					}
				})
			})
		})
	})

	context("shares calculation", () => {
		it("should get shares percent for more than one user before distribution period", async () => {
			const deposit = 100
			const withdraw = 50
			const shares1 = 100 * 2 + 50 * 2
			const shares2 = 100 * 4
			const sumShares = shares1 + shares2
			const expectedSharesPercent1 = Math.trunc(shares1 / sumShares * PERCENT_PRECISION)
			const expectedSharesPercent2 = Math.trunc(shares2 / sumShares * PERCENT_PRECISION)

			await Setup.BMCProxy.transfer(oracle, deposit * 2, { from: owner, })
			await Setup.BMCProxy.approve(Setup.Treasury.address, deposit * 2, { from: oracle, })
			await Setup.Treasury.addOracles([oracle,], { from: owner, })
			await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, 0, { from: oracle, })
			await Setup.Treasury.deposit(account2Id, deposit, 0, 0x0, 0, { from: oracle, })

			await Setup.timeMachine.jumpDaysForward(2)
			await Setup.Treasury.withdraw(account1Id, withdraw, oracle, 0, 0x0, { from: oracle, })
			await Setup.timeMachine.jumpDaysForward(2)

			assert.equal(await Setup.Treasury.getSharesPercentForPeriod.call(account1Id, 0), expectedSharesPercent1)
			assert.equal(await Setup.Treasury.getSharesPercentForPeriod.call(account2Id, 0), expectedSharesPercent2)
		})

		it("should get shares percent for more than one user after distribution period", async () => {
			const deposit = 100
			const withdraw = 50
			const shares1 = 100 * 2 + 50 * 2
			const shares2 = 100 * 4
			const sumShares = shares1 + shares2
			const expectedSharesPercent1 = Math.trunc(shares1 / sumShares * PERCENT_PRECISION)
			const expectedSharesPercent2 = Math.trunc(shares2 / sumShares * PERCENT_PRECISION)

			await Setup.BMCProxy.transfer(oracle, deposit * 2, { from: owner, })
			await Setup.BMCProxy.approve(Setup.Treasury.address, deposit * 2, { from: oracle, })
			await Setup.Treasury.addOracles([oracle,], { from: owner, })
			await Setup.Treasury.deposit(account1Id, deposit, 0, 0x0, 0, { from: oracle, })
			await Setup.Treasury.deposit(account2Id, deposit, 0, 0x0, 0, { from: oracle, })
			await Setup.timeMachine.jumpDaysForward(1)
			await Setup.Treasury.addDistributionPeriod({ from: distributionSource, })

			await Setup.timeMachine.jumpDaysForward(1)
			await Setup.Treasury.withdraw(account1Id, withdraw, oracle, 0, 0x0, { from: oracle, })
			await Setup.timeMachine.jumpDaysForward(2)

			await Setup.Treasury.getSharesPercentForPeriod(account1Id, 0)

			assert.equal((await Setup.Treasury.getSharesPercentForPeriod.call(account1Id, 0)).toNumber(), expectedSharesPercent1)
			assert.equal((await Setup.Treasury.getSharesPercentForPeriod.call(account2Id, 0)).toNumber(), expectedSharesPercent2)
		})

	})
})
