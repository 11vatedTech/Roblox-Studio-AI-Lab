--!strict
-- Every client/server message in the experience. Add new remotes here only; the
-- server will not accept anything undeclared.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local LabKit = require(ReplicatedStorage:WaitForChild("Packages"):WaitForChild("LabKit"))
local Schema = LabKit.Schema

return LabKit.Net.define({
	BuyUpgrade = {
		kind = "function",
		args = { Schema.enum({ "Value", "Magnet", "Speed" }) },
		rate = { capacity = 6, refillPerSecond = 3 },
	},
	UpdateSettings = {
		kind = "event",
		args = { Schema.struct({ music = Schema.boolean(), sfx = Schema.boolean(), reducedMotion = Schema.boolean() }) },
		rate = { capacity = 4, refillPerSecond = 1 },
	},
	GetState = {
		kind = "function",
		rate = { capacity = 4, refillPerSecond = 1 },
	},
	State = { kind = "toClient" },
	Toast = { kind = "toClient" },
})
