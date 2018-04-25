contract.skip("test hooks", () => {

	before("setup", async () => {
		console.log("before block")

	})

	beforeEach("setup each", async () => {
		console.log("before each block")
	})

	context("hook 1", () => {
		before("setup for hook 1", async () => {
			console.log("me once before tests in hook 1")
		})

		it("pending 1", async () => {
			assert.isTrue(true)
		})
		it("pending 2", async () => {
			assert.isTrue(true)
		})
		it("pending 3", async () => {
			assert.isTrue(true)
		})

	})

	context("hook 2", () => {
		before("before for hook 2", async () => {
			console.log("me once before tests in hook 2")
		})

		beforeEach("beforeEach for hook 2", async () => {
			console.log("me before each test")
		})

		it("you pending 1", async () => {
			assert.isTrue(true)
		})
		it("you pending 2",async () => {
			assert.isTrue(true)
		})
		it("you pending 3",async () => {
			assert.isTrue(true)
		})
		it("you pending 4",async () => {
			assert.isTrue(true)
		})
	})
})