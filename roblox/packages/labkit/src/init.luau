--!strict
-- LabKit: the 11vatedTech Lab production framework for Roblox experiences.
-- Place this folder in ReplicatedStorage as "LabKit". Server-only modules
-- (PlayerData, Receipts) are safe to require on the client but do nothing useful there.

local LabKit = {
	version = "1.0.0",
	Signal = require(script.Signal),
	Trove = require(script.Trove),
	Schema = require(script.Schema),
	RateLimiter = require(script.RateLimiter),
	Retry = require(script.Retry),
	Net = require(script.Net),
	PlayerData = require(script.PlayerData),
	Economy = require(script.Economy),
	Receipts = require(script.Receipts),
	Inventory = require(script.Inventory),
	StateMachine = require(script.StateMachine),
	Rng = require(script.Rng),
	LootTable = require(script.LootTable),
	Spring = require(script.Spring),
	Theme = require(script.Theme),
	Create = require(script.Create),
}

return LabKit
