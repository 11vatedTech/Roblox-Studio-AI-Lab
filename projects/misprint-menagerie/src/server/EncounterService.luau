local Players = game:GetService("Players")

local GameConfig = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("GameConfig"))
local RemoteProtocol = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("RemoteProtocol"))
local EncounterRules = require(script.Parent:WaitForChild("EncounterRules"))

local EncounterService = {}
EncounterService.__index = EncounterService

local function onlyKeys(payload, allowed)
	for key in pairs(payload) do
		if not allowed[key] then return false end
	end
	return true
end

function EncounterService.new(remotes, collectionService, world)
	local self = setmetatable({
		remotes = remotes,
		collectionService = collectionService,
		world = world,
		queued = {},
		encounter = nil,
		callbacks = {},
		lastIntentAt = {},
		playerConnections = {},
	}, EncounterService)
	return self
end

function EncounterService:setCallbacks(callbacks)
	self.callbacks = callbacks
end

function EncounterService:getEncounter()
	return self.encounter
end

function EncounterService:getPhase()
	return self.encounter and self.encounter.phase or "index"
end

function EncounterService:isParticipant(userId)
	return self.encounter ~= nil and self.encounter.players[userId] == true
end

function EncounterService:getParticipants()
	local result = {}
	if self.encounter then
		for userId in pairs(self.encounter.players) do
			local player = Players:GetPlayerByUserId(userId)
			if player then table.insert(result, player) end
		end
	end
	return result
end

function EncounterService:send(player, payload)
	if player and player.Parent == Players then
		self.remotes.ServerUpdate:FireClient(player, payload)
	end
end

function EncounterService:snapshot(player)
	local session = self.collectionService:ensure(player)
	local phase = self:getPhase()
	local count = 0
	for _ in pairs(self.queued) do count += 1 end
	return {
		kind = RemoteProtocol.Updates.Snapshot,
		phase = phase,
		ownedCardIds = table.clone(session.ownedIds),
		loadout = table.clone(session.loadout),
		queuedPlayerCount = count,
		isQueued = self.queued[player.UserId] ~= nil,
		message = self.queued[player.UserId] and "Party ready at the portal. Start when your team is set." or "",
		isParticipant = self:isParticipant(player.UserId),
		activeSummonCount = 0,
		bossHealth = 0,
		bossMaxHealth = 0,
	}
end

function EncounterService:sendSnapshot(player)
	self:send(player, self:snapshot(player))
end

function EncounterService:broadcast(payload)
	for _, player in ipairs(self:getParticipants()) do
		self:send(player, payload)
	end
	for _, player in pairs(self.queued) do
		self:send(player, payload)
	end
end

function EncounterService:reject(player, reason)
	self:send(player, { kind = RemoteProtocol.Updates.IntentRejected, reason = reason })
end

function EncounterService:nearPortal(player)
	local character = player.Character
	local rootPart = character and character:FindFirstChild("HumanoidRootPart")
	return rootPart ~= nil and (rootPart.Position - self.world.Portal.Position).Magnitude <= 16
end

function EncounterService:queuePlayer(player)
	local userId = player.UserId
	if self.encounter and self.encounter.phase ~= "entry" then
		self:reject(player, "hunt_in_progress")
		return false
	end
	if not self:nearPortal(player) then
		self:reject(player, "move_to_portal")
		return false
	end
	if self.queued[userId] then
		self:sendSnapshot(player)
		return true
	end
	local count = 0
	for _ in pairs(self.queued) do count += 1 end
	if count >= GameConfig.MaxPlayersPerHunt then
		self:reject(player, "party_full")
		return false
	end
	self.collectionService:ensure(player)
	self.queued[userId] = player
	self:broadcast({ kind = "party_waiting", queuedPlayerCount = count + 1 })
	self:sendSnapshot(player)
	return true
end

function EncounterService:teleportParticipant(player, position)
	local character = player.Character
	if character then
		character:PivotTo(CFrame.new(position))
	end
end

function EncounterService:beginHunt()
	if self.encounter then return false, "hunt_in_progress" end
	local ids = {}
	local players = {}
	for userId, player in pairs(self.queued) do
		if player.Parent == Players then
			table.insert(ids, userId)
			table.insert(players, player)
		end
	end
	if #ids == 0 then return false, "no_players" end
	if #ids > GameConfig.MaxPlayersPerHunt then return false, "party_full" end
	self.encounter = EncounterRules.new(ids)
	assert(EncounterRules.transition(self.encounter, "phase_one"), "failed to enter first boss phase")
	self.queued = {}
	for _, player in ipairs(players) do
		self:teleportParticipant(player, GameConfig.Arena.Entry)
	end
	if self.callbacks.onStarted then self.callbacks.onStarted(self.encounter) end
	self:broadcast({ kind = RemoteProtocol.Updates.EncounterState, phase = "phase_one", bossHealth = 300, bossMaxHealth = 300, objective = "Break the Redactor's first stamp" })
	for _, player in ipairs(players) do self:sendSnapshot(player) end
	return true
end

function EncounterService:advancePhase(nextPhase)
	if not self.encounter or not EncounterRules.transition(self.encounter, nextPhase) then
		return false
	end
	return true
end

function EncounterService:failHunt(reason)
	if not self.encounter or not EncounterRules.transition(self.encounter, "failed") then
		return false
	end
	if self.callbacks.onFailed then self.callbacks.onFailed(self.encounter) end
	self:broadcast({ kind = RemoteProtocol.Updates.EncounterState, phase = "failed", bossHealth = 0, bossMaxHealth = 300, message = reason or "The whole party was erased. Retry from the Index." })
	return true
end

function EncounterService:completeHunt(metrics)
	if not self.encounter or self.encounter.phase ~= "phase_two" then return false end
	if not EncounterRules.transition(self.encounter, "reward") then return false end
	if self.callbacks.onCompleted then self.callbacks.onCompleted(self.encounter) end
	for userId in pairs(self.encounter.players) do
		if EncounterRules.tryGrantReward(self.encounter, userId) then
			local playerMetrics = metrics and metrics[userId] or {}
			local unlocked = {}
			if playerMetrics.counteredAttack then
				if self.collectionService:grantChallenge(userId, "foldwyn_pagewing", "fold_the_blank") then
					table.insert(unlocked, "foldwyn_pagewing")
				end
			end
			if playerMetrics.noKnockout then
				if self.collectionService:grantChallenge(userId, "buttongrin", "hold_the_line") then
					table.insert(unlocked, "buttongrin")
				end
			end
			if (playerMetrics.weakPointHits or 0) >= 1 then
				if self.collectionService:grantChallenge(userId, "sableline", "trace_the_echo") then
					table.insert(unlocked, "sableline")
				end
			end
			local player = Players:GetPlayerByUserId(userId)
			if player then
				self:send(player, {
					kind = RemoteProtocol.Updates.EncounterState,
					phase = "reward",
					bossHealth = 0,
					bossMaxHealth = 300,
					unlockedCardIds = unlocked,
					ownedCardIds = self.collectionService:getOwnedIds(userId),
					message = #unlocked > 0 and "Hunt complete. New pages joined your session Index." or "Hunt complete. Replay and meet another page challenge.",
				})
			end
		end
	end
	return true
end

function EncounterService:onKnockout(player)
	local encounter = self.encounter
	if not encounter or not encounter.players[player.UserId] then return end
	EncounterRules.setKnockedOut(encounter, player.UserId, true)
	if self.callbacks.onKnockout then self.callbacks.onKnockout(player.UserId) end
	self:send(player, { kind = RemoteProtocol.Updates.EncounterState, phase = encounter.phase, message = "Page erased. You will return at the arena entrance." })
	if EncounterRules.allKnockedOut(encounter) then
		self:failHunt("Every caller was erased. The hunt ended without a reward.")
	end
end

function EncounterService:onCharacterAdded(player, character)
	local encounter = self.encounter
	local userId = player.UserId
	if encounter and encounter.players[userId] and encounter.knockedOut[userId] then
		task.delay(0.2, function()
			if self.encounter ~= encounter or not encounter.players[userId] or encounter.phase == "failed" then return end
			EncounterRules.setKnockedOut(encounter, userId, false)
			if character.Parent then character:PivotTo(CFrame.new(GameConfig.Arena.Entry)) end
			self:send(player, { kind = RemoteProtocol.Updates.EncounterState, phase = encounter.phase, message = "Back at the entry. Your earlier summons were cleared." })
		end)
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid") or character:WaitForChild("Humanoid", 5)
	if humanoid then
		humanoid.Died:Connect(function() self:onKnockout(player) end)
	end
end

function EncounterService:closeHunt(returnPlayers)
	local encounter = self.encounter
	if not encounter then return false end
	if encounter.phase == "reward" or encounter.phase == "failed" then
		EncounterRules.transition(encounter, "closed")
	end
	local participants = self:getParticipants()
	if self.callbacks.onClosed then self.callbacks.onClosed(encounter) end
	self.encounter = nil
	for _, player in ipairs(participants) do
		if returnPlayers then self.world.teleportToIndex(player) end
		self:sendSnapshot(player)
	end
	return true
end

function EncounterService:restartHunt()
	if not self.encounter or (self.encounter.phase ~= "reward" and self.encounter.phase ~= "failed") then
		return false, "hunt_not_complete"
	end
	local participants = self:getParticipants()
	self:closeHunt(true)
	for _, player in ipairs(participants) do self.queued[player.UserId] = player end
	return self:beginHunt()
end

function EncounterService:handleIntent(player, payload)
	if type(payload) ~= "table" or type(payload.kind) ~= "string" then
		self:reject(player, "malformed")
		return
	end
	local handledKinds = {
		[RemoteProtocol.Intents.JoinHunt] = true,
		[RemoteProtocol.Intents.SelectLoadout] = true,
		[RemoteProtocol.Intents.StartHunt] = true,
		[RemoteProtocol.Intents.ReturnToIndex] = true,
		[RemoteProtocol.Intents.RetryHunt] = true,
	}
	if not handledKinds[payload.kind] then return end
	local now = os.clock()
	if now - (self.lastIntentAt[player.UserId] or 0) < 0.15 then
		self:reject(player, "rate_limited")
		return
	end
	self.lastIntentAt[player.UserId] = now
	if payload.kind == RemoteProtocol.Intents.JoinHunt then
		if not onlyKeys(payload, { kind = true }) then self:reject(player, "malformed") return end
		self:queuePlayer(player)
	elseif payload.kind == RemoteProtocol.Intents.SelectLoadout then
		if not onlyKeys(payload, { kind = true, cardIds = true }) or type(payload.cardIds) ~= "table" then self:reject(player, "malformed") return end
		if self.encounter and self.encounter.players[player.UserId] then self:reject(player, "loadout_locked") return end
		local ok, reason = self.collectionService:setLoadout(player, payload.cardIds)
		if not ok then self:reject(player, reason) else self:sendSnapshot(player) end
	elseif payload.kind == RemoteProtocol.Intents.StartHunt then
		if not onlyKeys(payload, { kind = true }) then self:reject(player, "malformed") return end
		if not self.queued[player.UserId] then self:reject(player, "not_queued") return end
		local ok, reason = self:beginHunt()
		if not ok then self:reject(player, reason) end
	elseif payload.kind == RemoteProtocol.Intents.ReturnToIndex then
		if not onlyKeys(payload, { kind = true }) then self:reject(player, "malformed") return end
		if not self.encounter or (self.encounter.phase ~= "reward" and self.encounter.phase ~= "failed") then self:reject(player, "hunt_active") return end
		self:closeHunt(true)
	elseif payload.kind == RemoteProtocol.Intents.RetryHunt then
		if not onlyKeys(payload, { kind = true }) then self:reject(player, "malformed") return end
		local ok, reason = self:restartHunt()
		if not ok then self:reject(player, reason) end
	end
end

function EncounterService:start()
	local function onPlayerAdded(player)
		self.collectionService:ensure(player)
		local connection = player.CharacterAdded:Connect(function(character) self:onCharacterAdded(player, character) end)
		self.playerConnections[player.UserId] = connection
		if player.Character then self:onCharacterAdded(player, player.Character) end
		task.delay(1, function() if player.Parent == Players then self:sendSnapshot(player) end end)
	end
	local function onPlayerRemoving(player)
		local userId = player.UserId
		local connection = self.playerConnections[userId]
		if connection then connection:Disconnect() self.playerConnections[userId] = nil end
		self.lastIntentAt[userId] = nil
		self.queued[userId] = nil
		if self.encounter and self.encounter.players[userId] then
			EncounterRules.removePlayer(self.encounter, userId)
			if self.callbacks.onPlayerRemoved then self.callbacks.onPlayerRemoved(userId) end
			if next(self.encounter.players) == nil then
				if self.callbacks.onClosed then self.callbacks.onClosed(self.encounter) end
				self.encounter = nil
			end
		end
		self.collectionService:remove(userId)
	end
	Players.PlayerAdded:Connect(onPlayerAdded)
	Players.PlayerRemoving:Connect(onPlayerRemoving)
	self.remotes.ClientIntent.OnServerEvent:Connect(function(player, payload) self:handleIntent(player, payload) end)
	self.world.Prompt.Triggered:Connect(function(player)
		self:handleIntent(player, { kind = RemoteProtocol.Intents.JoinHunt })
	end)
	for _, player in ipairs(Players:GetPlayers()) do onPlayerAdded(player) end
end

return EncounterService
