local Players = game:GetService("Players")
local GameConfig = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("GameConfig"))
local RemoteProtocol = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("RemoteProtocol"))
local CardCatalog = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("CardCatalog"))
local CombatRules = require(script.Parent:WaitForChild("CombatRules"))

local CombatService = {}
CombatService.__index = CombatService

local function exactKeys(payload, allowed)
	for key in pairs(payload) do if not allowed[key] then return false end end
	return true
end

local function asSet(values)
	local result = {}
	for _, value in ipairs(values) do result[value] = true end
	return result
end

function CombatService.new(remotes, encounterService, collectionService, summonService, bossService, world)
	local self = setmetatable({
		remotes = remotes,
		encounterService = encounterService,
		collectionService = collectionService,
		summonService = summonService,
		bossService = bossService,
		world = world,
		lastActionAt = {},
		lastCallAt = {},
	}, CombatService)
	return self
end

function CombatService:sendState(player, message)
	local boss = self.bossService:getState()
	self.encounterService:send(player, {
		kind = RemoteProtocol.Updates.EncounterState,
		phase = boss.phase,
		bossHealth = boss.health,
		bossMaxHealth = boss.maxHealth,
		activeSummonCount = self.summonService:getCount(player.UserId),
		message = message,
	})
end

function CombatService:reject(player, reason)
	self.encounterService:send(player, { kind = RemoteProtocol.Updates.CallRejected, reason = reason })
	self:sendState(player, "Call rejected · " .. reason)
end

function CombatService:handleCall(player, payload)
	if not exactKeys(payload, { kind = true, cardId = true, position = true }) then self:reject(player, "malformed") return end
	local loadout = self.collectionService:getLoadout(player.UserId)
	local owned = asSet(loadout)
	local definition = type(payload.cardId) == "string" and CardCatalog.get(payload.cardId) or nil
	local context = {
		member = self.encounterService:isParticipant(player.UserId),
		phase = self.encounterService:getPhase(),
		ownedIds = owned,
		activeSummons = self.summonService:getCount(player.UserId),
		maxActiveSummons = GameConfig.MaxActiveSummonsPerPlayer,
		callCooldownSeconds = definition and definition.cooldownSeconds or 0,
		lastCallAt = self.lastCallAt[player.UserId] or {},
		requestCooldownSeconds = GameConfig.Rates.RequestCooldownSeconds,
		lastActionAt = self.lastActionAt[player.UserId] or 0,
		min = self.world.ArenaBounds.Min,
		max = self.world.ArenaBounds.Max,
	}
	local now = os.clock()
	local accepted, reason = CombatRules.validateCall(context, { cardId = payload.cardId, position = payload.position }, now)
	if not accepted then self:reject(player, reason) return end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local bounds = self.world.ArenaBounds
	if not root
		or root.Position.X < bounds.Min.X or root.Position.X > bounds.Max.X
		or root.Position.Y < bounds.Min.Y or root.Position.Y > bounds.Max.Y
		or root.Position.Z < bounds.Min.Z or root.Position.Z > bounds.Max.Z
		or (payload.position - root.Position).Magnitude > GameConfig.Rates.MaxTargetDistance then
		self:reject(player, "out_of_bounds")
		return
	end
	local callTimes = self.lastCallAt[player.UserId] or {}
	local succeeded, callReason = self.summonService:call(player, payload.cardId, payload.position)
	if not succeeded then self:reject(player, callReason or "malformed") return end
	callTimes[payload.cardId] = now
	self.lastCallAt[player.UserId] = callTimes
	self.lastActionAt[player.UserId] = now
	self:sendState(player, definition.displayName .. " called")
end

function CombatService:handleCommand(player, payload)
	if not exactKeys(payload, { kind = true, command = true }) or type(payload.command) ~= "string" then self:reject(player, "malformed") return end
	if not self.encounterService:isParticipant(player.UserId) then self:reject(player, "not_member") return end
	if self.encounterService:getPhase() ~= "phase_one" and self.encounterService:getPhase() ~= "phase_two" then self:reject(player, "wrong_phase") return end
	if payload.command ~= "follow" and payload.command ~= "hold" and payload.command ~= "focus" then self:reject(player, "malformed") return end
	local now = os.clock()
	if now - (self.lastActionAt[player.UserId] or 0) < GameConfig.Rates.RequestCooldownSeconds then self:reject(player, "rate_limited") return end
	self.summonService:command(player.UserId, payload.command)
	self.lastActionAt[player.UserId] = now
	self:sendState(player, "Summon command · " .. payload.command)
end

function CombatService:start()
	self.remotes.ClientIntent.OnServerEvent:Connect(function(player, payload)
		if type(payload) ~= "table" or type(payload.kind) ~= "string" then return end
		if payload.kind == RemoteProtocol.Intents.CallCard then
			self:handleCall(player, payload)
		elseif payload.kind == RemoteProtocol.Intents.CommandSummons then
			self:handleCommand(player, payload)
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		self.lastActionAt[player.UserId] = nil
		self.lastCallAt[player.UserId] = nil
	end)
end

return CombatService
