function Calculator() {
	const base = 10
	const self = this

	this.fee = (amount, fee, decimal) => {
		return (amount * fee) / (base ** decimal)
	}

	this.withoutFee = (amount, fee, decimal) => {
		return amount - self.fee(amount, fee, decimal)
	}
}

function Treasury() {
	const self = this

	const DEPOSIT_ACTION = "deposit"
	const WITHDRAW_ACTION = "withdraw"
	const ONE_DAY = 1000 * 60 * 60 * 24 // The number of milliseconds in one day

	this.userInfo = {}
	this.deposits = [] // { user, date, action, amount }
	this.bmcDays = {} // date: { date, rate, totalAmount }

	this.deposit = (userKey, amount, date) => {
		const lastDepositDay = self.getLastDepositDay()
		date = date || new Date()
		const depositDay = fullDays(date)

		self.deposits.push({
			user: userKey,
			date: depositDay,
			action: DEPOSIT_ACTION,
			amount: amount,
		})

		const previousBmcDaysStats = getBmcDaysRecord(lastDepositDay)
		var bmcDayStats = {}
		bmcDayStats["rate"] = previousBmcDaysStats["rate"] + amount
		bmcDayStats["totalAmount"] = previousBmcDaysStats["totalAmount"] + previousBmcDaysStats["rate"] * (depositDay - lastDepositDay)
		bmcDayStats["date"] = depositDay
		self.bmcDays[depositDay] = bmcDayStats

		return depositDay
	}

	this.withdraw = (userKey, amount, date) => {
		const userBalance = self.totalBalance(userKey)
		if (userBalance < amount) {
			throw `Withdraw amount (${amount}) is higher than total user balance (${userBalance})`
		}

		const lastDepositDay = self.getLastDepositDay()
		date = date || new Date()
		const withdrawDate = fullDays(date)

		self.deposits.push({
			user: userKey,
			date: withdrawDate,
			action: WITHDRAW_ACTION,
			amount: amount,
		})

		const previousBmcDaysStats = getBmcDaysRecord(lastDepositDay)
		var bmcDayStats = {}
		bmcDayStats["rate"] = previousBmcDaysStats["rate"] - amount
		bmcDayStats["totalAmount"] = previousBmcDaysStats["totalAmount"] + previousBmcDaysStats["rate"] * (withdrawDate - lastDepositDay)
		bmcDayStats["date"] = withdrawDate
		self.bmcDays[withdrawDate] = bmcDayStats

		return withdrawDate
	}

	this.getUserSharesPercentForDate = (userKey, untilDate) => {
		const bonusDate = fullDays(untilDate)
		const previousBmcDaysStats = getBmcDaysRecord(bonusDate)
		const totalAmount = previousBmcDaysStats["totalAmount"] + previousBmcDaysStats["rate"] * (bonusDate - previousBmcDaysStats["date"])
		const userBmcDays = self.calculateBmcDaysForUser(userKey, untilDate)

		return (userBmcDays / totalAmount).toFixed(4)
	}

	this.totalBalance = userKey => {
		return self.deposits.reduce((balance, deposit) => {
			if (deposit.user !== userKey) {
				return balance
			}

			if (deposit.action === DEPOSIT_ACTION) {
				balance += deposit.amount
			}
			else if (deposit.action === WITHDRAW_ACTION) {
				balance -= deposit.amount
			}

			return balance
		}, 0)
	}

	this.calculateBmcDaysForUser = (userKey, untilDate) => {
		var previousDepositDate = 0
		var balance = 0
		var lastRecordedDepositDate = 0
		untilDate = fullDays(untilDate)
		var periodBmcDays = self.deposits.reduce((userBmcDays, deposit) => {
			if (deposit.user !== userKey) {
				return userBmcDays
			}

			if (deposit.date >= untilDate) {
				return userBmcDays
			}

			lastRecordedDepositDate = deposit.date

			var lastPeriodBalance = balance

			if (deposit.action === DEPOSIT_ACTION) {
				balance += deposit.amount
			}
			else if (deposit.action === WITHDRAW_ACTION) {
				balance -= deposit.amount
			}
			else {
				throw `Unknown deposit action found: ${deposit.action}`
			}

			if (previousDepositDate === 0) {
				previousDepositDate = deposit.date
				return userBmcDays
			}

			const addedBmcDays = (lastRecordedDepositDate - previousDepositDate) * lastPeriodBalance

			userBmcDays += addedBmcDays
			// console.log(`user "${userKey}": ${lastRecordedDepositDate - previousDepositDate} days, ${addedBmcDays} added`);

			previousDepositDate = deposit.date

			return userBmcDays
		}, 0)

		if (lastRecordedDepositDate !== 0 && lastRecordedDepositDate !== untilDate) {
			const addedBmcDays = (untilDate - lastRecordedDepositDate) * balance
			periodBmcDays += addedBmcDays
			// console.log(`user "${userKey}: ${untilDate - lastRecordedDepositDate} days more added, ${addedBmcDays} bmc-days more"`);
		}

		// console.log("-----------done-----------");

		return periodBmcDays
	}

	this.getLastDepositDay = () => {
		if (self.deposits.length === 0) {
			return 0
		}
		return self.deposits[self.deposits.length - 1]["date"]
	}

	this.getLastDepositDate = () => {
		const lastDepositDay = self.getLastDepositDay()
		const msDate1 = new Date('1970-01-01').getTime()
		return new Date(msDate1 + lastDepositDay * ONE_DAY)
	}

	/* PRIVATE */

	function getBmcDaysRecord(day) {
		if (self.bmcDays[day] === undefined) {
			const closestDeposit = self.deposits.slice().reverse().find(deposit => {
				return deposit.date <= day
			})

			if (closestDeposit === undefined) {
				return {
					rate: 0,
					totalAmount: 0,
				}
			}

			return self.bmcDays[closestDeposit.date]
		}

		return self.bmcDays[day]
	}

	function fullDays(date) {
		// Convert both dates to milliseconds
		const msDate1 = new Date('1970-01-01').getTime()
		const msDate2 = date.getTime()

		// Calculate the difference in milliseconds
		const msDifference = Math.abs(msDate1 - msDate2)

		// Convert back to days and return
		return Math.round(msDifference / ONE_DAY)
	}

}

module.exports = Calculator
module.exports.treasuryConstructor = Treasury
