local CardCatalog = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("CardCatalog"))

local BossService = {}
BossService.__index = BossService

local MAX_HEALTH = 300
local DAMAGE_BY_CARD = {
	girdle_9 = 16,
	nib_and_nuzzle = 18,
	morrowbell = 13,
	foldwyn_pagewing = 14,
	buttongrin = 14,
	sableline = 15,
}

function BossService.new(world, encounterService)
	local self = setmetatable({
		world = world,
		encounterService = encounterService,
		health = MAX_HEALTH,
		active = false,
		generation = 0,
		weakPointUntil = 0,
		staggerUntil = 0,
		summonService = nil,
	}, BossService)
	self.model = world.BossModel
	self.healthLabel = world.BossHealthLabel
	return self
end

function BossService:setSummonService(summonService)
	self.summonService = summonService
end

function BossService:getState()
	return { health = self.health, maxHealth = MAX_HEALTH, phase = self.encounterService:getPhase() }
end

function BossService:publish(message)
	if self.healthLabel then
		self.healthLabel.Text = string.format("THE REDACTOR   %d / %d", math.max(0, math.ceil(self.health)), MAX_HEALTH)
	end
	self.encounterService:broadcast({
		kind = "encounter_state",
		phase = self.encounterService:getPhase(),
		bossHealth = math.max(0, self.health),
		bossMaxHealth = MAX_HEALTH,
		message = message,
	})
end

function BossService:markWeakPoint(duration)
	self.weakPointUntil = math.max(self.weakPointUntil, os.clock() + duration)
	if self.model and self.model.Parent then
		local seal = self.model:FindFirstChild("Ink seal")
		if seal then seal.Color = Color3.fromRGB(133, 230, 206) end
	end
end

function BossService:stagger(duration)
	self.staggerUntil = math.max(self.staggerUntil, os.clock() + duration)
	self:publish("A summon staggered the Redactor. Its next stamp is delayed.")
end

function BossService:applySummonHit(cardId, userId, comboBonus)
	if not self.active or self.health <= 0 then return 0 end
	local phase = self.encounterService:getPhase()
	if phase ~= "phase_one" and phase ~= "phase_two" then return 0 end
	local definition = CardCatalog.get(cardId)
	if not definition then return 0 end
	if cardId == "morrowbell" then
		self:markWeakPoint(6)
		if self.summonService then self.summonService:recordWeakPointHit(userId) end
	end
	local damage = DAMAGE_BY_CARD[cardId] or 10
	if os.clock() < self.weakPointUntil then damage *= 1.55 end
	if comboBonus then damage *= 1.5 end
	self.health = math.max(0, self.health - damage)
	if self.health <= MAX_HEALTH / 2 and phase == "phase_one" then
		self.encounterService:advancePhase("phase_two")
		if self.model and self.model.Parent then
			for _, item in ipairs(self.model:GetDescendants()) do
				if item:IsA("BasePart") and item.Name ~= "Root" then
					item.Color = item.Color:Lerp(Color3.fromRGB(191, 70, 86), 0.28)
				end
			end
		end
		self:publish("The Redactor reshapes the board. Watch for paired erasures.")
	elseif self.health <= 0 then
		self.active = false
		self.world.clearTelegraph()
		self:publish("The final stamp breaks. The Index is safe.")
		if self.summonService then
			self.encounterService:completeHunt(self.summonService:getMetrics())
		else
			self.encounterService:completeHunt({})
		end
	else
		self:publish()
	end
	return damage
end

function BossService:zoneContains(position, zoneName)
	if zoneName == "west" then return position.X >= -28 and position.X <= -8 and math.abs(position.Z) <= 18 end
	if zoneName == "east" then return position.X >= 8 and position.X <= 28 and math.abs(position.Z) <= 18 end
	if zoneName == "north" then return position.Z >= -36 and position.Z <= -1 and math.abs(position.X) <= 10 end
	if zoneName == "south" then return position.Z >= 1 and position.Z <= 36 and math.abs(position.X) <= 10 end
	return false
end

function BossService:runAttackLoop(generation)
	local phaseOne = { "west", "east" }
	local phaseTwo = { "north", "south", "west", "east" }
	local attackIndex = 0
	while self.active and self.generation == generation do
		task.wait(5)
		if os.clock() < self.staggerUntil then
			task.wait(math.max(0, self.staggerUntil - os.clock()))
		end
		local phase = self.encounterService:getPhase()
		if phase ~= "phase_one" and phase ~= "phase_two" then break end
		attackIndex += 1
		local options = phase == "phase_one" and phaseOne or phaseTwo
		local zoneName = options[((attackIndex - 1) % #options) + 1]
		local zones = { zoneName }
		local caption = (phase == "phase_one") and "ERASURE MARKED · MOVE OUT OF THE GLOW" or "DOUBLE STAMP · MOVE OR CALL A COUNTER"
		self.encounterService:broadcast({ kind = "encounter_state", phase = phase, bossHealth = self.health, bossMaxHealth = MAX_HEALTH, telegraph = caption })
		if phase == "phase_two" and attackIndex % 2 == 0 then
			local second = options[(attackIndex % #options) + 1]
			if second ~= zoneName then table.insert(zones, second) end
		end
		self.world.showTelegraph(zones, caption)
		task.wait(2.6)
		if not self.active or self.generation ~= generation then
			self.world.clearTelegraph()
			break
		end
		if self.encounterService:getPhase() ~= phase then
			self.world.clearTelegraph()
			self.encounterService:broadcast({ kind = "encounter_state", phase = self.encounterService:getPhase(), bossHealth = self.health, bossMaxHealth = MAX_HEALTH, telegraph = "" })
			continue
		end
		for _, player in ipairs(self.encounterService:getParticipants()) do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			if root and humanoid and humanoid.Health > 0 then
				local hit = false
				for _, name in ipairs(zones) do
					if self:zoneContains(root.Position, name) then hit = true break end
				end
				if hit then
					if self.summonService and self.summonService:canCounter(player.UserId, zones) then
						self.summonService:recordCounter(player.UserId)
						self.encounterService:send(player, { kind = "encounter_state", phase = phase, message = "A summon counter held the printed line." })
					else
						humanoid:TakeDamage(phase == "phase_one" and 24 or 32)
					end
				end
			end
		end
		self.world.clearTelegraph()
		self.encounterService:broadcast({ kind = "encounter_state", phase = self.encounterService:getPhase(), bossHealth = self.health, bossMaxHealth = MAX_HEALTH, telegraph = "" })
		if not self.active or self.generation ~= generation then break end
		task.wait(2)
	end
	self.world.clearTelegraph()
end

function BossService:start()
	self.generation += 1
	self.health = MAX_HEALTH
	self.weakPointUntil = 0
	self.staggerUntil = 0
	self.active = true
	if self.model then self.model.Parent = self.world.Arena end
	self:publish("THE REDACTOR · Break its stamp and read the floor marks.")
	local generation = self.generation
	task.spawn(function() self:runAttackLoop(generation) end)
end

function BossService:stop()
	self.active = false
	self.generation += 1
	self.world.clearTelegraph()
	if self.model then self.model.Parent = self.world.Arena end
end

return BossService
