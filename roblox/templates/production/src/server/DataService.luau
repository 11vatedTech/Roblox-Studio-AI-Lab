--!strict
-- Owns player persistence: session-locked profiles, autosave, shutdown flush, and
-- kicking a player whose session another server took over (prevents duplication).
-- In Studio without "Enable Studio Access to API Services", it falls back to an
-- in-memory store and says so; nothing is written to production DataStores then.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local LabKit = require(ReplicatedStorage:WaitForChild("Packages"):WaitForChild("LabKit"))
local GameConfig = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("GameConfig"))

local DataService = {}
DataService.Loaded = LabKit.Signal.new()
DataService.Releasing = LabKit.Signal.new()

local TEMPLATE = {
	wallet = { [GameConfig.currency] = GameConfig.startingCoins },
	ledger = { keys = {} },
	upgrades = {},
	items = {},
	settings = { music = true, sfx = true, reducedMotion = false },
	stats = { orbsCollected = 0, sessions = 0, playSeconds = 0 },
}

local function chooseAdapter()
	local ok, storeOrError = pcall(function()
		return DataStoreService:GetDataStore(GameConfig.dataStoreName)
	end)
	if ok and storeOrError then
		if RunService:IsStudio() then
			-- Probe access; Studio throws when API access is disabled.
			local probeOk = pcall(function()
				storeOrError:GetAsync("__labkit_probe")
			end)
			if not probeOk then
				warn("[DataService] Studio API access is disabled; using in-memory data for this session.")
				return LabKit.PlayerData.memoryAdapter(), "memory"
			end
		end
		return LabKit.PlayerData.dataStoreAdapter(storeOrError), "datastore"
	end
	warn("[DataService] DataStore unavailable (" .. tostring(storeOrError) .. "); using in-memory data.")
	return LabKit.PlayerData.memoryAdapter(), "memory"
end

local adapter, mode = chooseAdapter()
DataService.mode = mode

local store = LabKit.PlayerData.new({
	adapter = adapter,
	template = TEMPLATE,
	version = GameConfig.dataVersion,
	migrations = {},
	jobId = if game.JobId ~= "" then game.JobId else "studio-" .. tostring(os.time()),
	validate = function(data)
		return type(data.wallet) == "table" and type(data.upgrades) == "table", "wallet/upgrades missing"
	end,
})
DataService.store = store

local sessionStart: { [Player]: number } = {}

local function keyFor(player: Player): string
	return tostring(player.UserId)
end

function DataService.get(player: Player)
	return store:get(keyFor(player))
end

local function onPlayerAdded(player: Player)
	local profile, reason = store:load(keyFor(player))
	if profile == nil then
		local message = "Your data could not be loaded (" .. tostring(reason) .. "). Please rejoin in a moment."
		if reason == "data_from_newer_version" then
			message = "This server is out of date. Please rejoin to reach a newer server."
		end
		player:Kick(message)
		return
	end
	if not player:IsDescendantOf(Players) then
		profile:release()
		return
	end
	profile.Released:Connect(function(why)
		if why == "session_lost" and player:IsDescendantOf(Players) then
			player:Kick("Your data was opened on another server. Please rejoin.")
		end
	end)
	profile.Data.stats.sessions += 1
	sessionStart[player] = os.clock()
	DataService.Loaded:Fire(player, profile)
end

local function onPlayerRemoving(player: Player)
	local profile = DataService.get(player)
	if profile then
		local started = sessionStart[player]
		if started then
			profile.Data.stats.playSeconds += math.floor(os.clock() - started)
		end
		DataService.Releasing:Fire(player, profile)
		profile:release()
	end
	sessionStart[player] = nil
end

function DataService.start()
	Players.PlayerAdded:Connect(onPlayerAdded)
	Players.PlayerRemoving:Connect(onPlayerRemoving)
	for _, player in ipairs(Players:GetPlayers()) do
		task.spawn(onPlayerAdded, player)
	end
	task.spawn(function()
		while true do
			task.wait(GameConfig.autosaveSeconds)
			store:saveAll()
		end
	end)
	game:BindToClose(function()
		-- Release every profile before the server shuts down so the next server can
		-- load immediately instead of waiting for the lock to go stale.
		local pending = 0
		for _, player in ipairs(Players:GetPlayers()) do
			pending += 1
			task.spawn(function()
				onPlayerRemoving(player)
				pending -= 1
			end)
		end
		local deadline = os.clock() + 25
		while pending > 0 and os.clock() < deadline do
			task.wait(0.1)
		end
	end)
end

return DataService
