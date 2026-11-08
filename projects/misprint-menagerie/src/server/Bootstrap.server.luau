local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerScriptService = game:GetService("ServerScriptService")

local shared = ReplicatedStorage:WaitForChild("MisprintShared")
local protocol = require(shared:WaitForChild("RemoteProtocol"))
local config = require(shared:WaitForChild("GameConfig"))

local server = ServerScriptService:WaitForChild("MisprintServer")
local WorldBuilder = require(server:WaitForChild("WorldBuilder"))
local CollectionService = require(server:WaitForChild("CollectionService"))
local EncounterService = require(server:WaitForChild("EncounterService"))
local BossService = require(server:WaitForChild("BossService"))
local SummonService = require(server:WaitForChild("SummonService"))
local CombatService = require(server:WaitForChild("CombatService"))

local function getOrCreate(parent, name, className)
	local object = parent:FindFirstChild(name)
	if object then
		assert(object.ClassName == className, string.format("%s exists as %s, expected %s", object:GetFullName(), object.ClassName, className))
		return object
	end
	object = Instance.new(className)
	object.Name = name
	object.Parent = parent
	return object
end

local remotesFolder = getOrCreate(ReplicatedStorage, protocol.FolderName, "Folder")
local remotes = {
	ClientIntent = getOrCreate(remotesFolder, protocol.Events.ClientIntent, "RemoteEvent"),
	ServerUpdate = getOrCreate(remotesFolder, protocol.Events.ServerUpdate, "RemoteEvent"),
}

local world = WorldBuilder.build(config)
local collections = CollectionService.new()
local encounter = EncounterService.new(remotes, collections, world)
local boss = BossService.new(world, encounter)
local summons = SummonService.new(world, encounter, boss)
boss:setSummonService(summons)

encounter:setCallbacks({
	onStarted = function(state)
		summons:clearAll()
		for userId in pairs(state.players) do summons:ensureMetrics(userId) end
		boss:start()
	end,
	onFailed = function()
		boss:stop()
		summons:clearAll()
	end,
	onCompleted = function()
		boss:stop()
		summons:clearAll()
	end,
	onClosed = function()
		boss:stop()
		summons:clearAll()
	end,
	onKnockout = function(userId) summons:markKnockout(userId) end,
	onPlayerRemoved = function(userId) summons:removePlayer(userId) end,
})

local combat = CombatService.new(remotes, encounter, collections, summons, boss, world)
encounter:start()
combat:start()

print("Misprint Menagerie server ready · session-only collection · local vertical slice")
