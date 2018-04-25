const Calculator = require('../../common/helpers/calculator')
const TimeMachine = require('bmc-contract/common/helpers/timemachine')

contract("Treasury (Virtual Model)", () => {

	const timeMachine = new TimeMachine(web3)

	before("setup", async () => {

	})

	context("one user", () => {
		let treasury
		const user1 = "123"

		it("setup", () => {
			treasury = new Calculator.treasuryConstructor()
			assert.isDefined(treasury)
		})

		it("should have balance after single deposit for user1", () => {
			const depositAmount = 300
			const depositDate = new Date()

			treasury.deposit(user1, depositAmount, depositDate)
			assert.equal(treasury.totalBalance(user1), depositAmount)
		})

		it("should have correct balance after deposit and withdrawal", () => {
			const beforeBalance = treasury.totalBalance(user1)
			const lastDepositDate = treasury.getLastDepositDate()

			const depositAmount = 1000

			treasury.deposit(user1, depositAmount, lastDepositDate)

			const withdrawAmount = 100
			const withdrawDate = lastDepositDate

			treasury.withdraw(user1, withdrawAmount, withdrawDate)

			assert.equal(treasury.totalBalance(user1), beforeBalance + depositAmount - withdrawAmount)
		})

		it("should have correct bmc-days for date where balance activity where made", () => {
			assert.equal(treasury.calculateBmcDaysForUser(user1, new Date()), 0)
		})

		it("should be able to do more deposits and calculate bmc-days for every period", () => {
			const beforeBalance = treasury.totalBalance(user1)
			const lastDepositDate = treasury.getLastDepositDate()

			var nextDepositDate = timeMachine.addDays(lastDepositDate, 3)
			const depositAmount1 = 500
			treasury.deposit(user1, depositAmount1, nextDepositDate)

			var expectedBmcDays = beforeBalance * 3
			assert.equal(treasury.calculateBmcDaysForUser(user1, nextDepositDate), expectedBmcDays)

			nextDepositDate = timeMachine.addDays(nextDepositDate, 7)
			const withdrawAmount1 = 200
			treasury.withdraw(user1, withdrawAmount1, nextDepositDate)

			expectedBmcDays = expectedBmcDays + (beforeBalance + depositAmount1) * 7
			assert(treasury.calculateBmcDaysForUser(user1, nextDepositDate), expectedBmcDays)

			var checkDate = timeMachine.addDays(nextDepositDate, 2)
			var checkBmcDays = expectedBmcDays + (beforeBalance + depositAmount1 - withdrawAmount1) * 2
			assert(treasury.calculateBmcDaysForUser(user1, checkDate), checkBmcDays)
		})
	})

	context("two users", () => {
		let treasury
		const user1 = "123"
		const user2 = "234"

		it("setup", () => {
			treasury = new Calculator.treasuryConstructor()
			assert.isDefined(treasury)
		})

		it("should have correct shares distribution for the first time", () => {
			const depositAmount1 = 1000
			const depositAmount2 = 1500
			const withdrawAmount1 = 400

			var depositDate = new Date()
			treasury.deposit(user1, depositAmount1, depositDate)

			depositDate = timeMachine.addDays(depositDate, 1)
			treasury.deposit(user2, depositAmount2, depositDate)

			depositDate = timeMachine.addDays(depositDate, 13)
			treasury.withdraw(user1, withdrawAmount1, depositDate)

			const distributionDate = timeMachine.addDays(depositDate, 16)

			const expectedUser1BmcDays = depositAmount1 * 14 + (depositAmount1 - withdrawAmount1) * 16
			assert.equal(treasury.calculateBmcDaysForUser(user1, distributionDate), expectedUser1BmcDays)
			const expectedUser2BmcDays = depositAmount2 * 29
			assert.equal(treasury.calculateBmcDaysForUser(user2, distributionDate), expectedUser2BmcDays)
			assert.equal(treasury.getUserSharesPercentForDate(user1, distributionDate), (expectedUser1BmcDays / (expectedUser1BmcDays + expectedUser2BmcDays)).toFixed(4))
			assert.equal(treasury.getUserSharesPercentForDate(user2, distributionDate), (expectedUser2BmcDays / (expectedUser1BmcDays + expectedUser2BmcDays)).toFixed(4))
		})
	})
})
