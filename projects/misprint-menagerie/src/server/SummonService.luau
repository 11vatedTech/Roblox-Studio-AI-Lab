local CardCatalog = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("CardCatalog"))
local CreatureBuilder = require(script.Parent:WaitForChild("CreatureBuilder"))

local SummonService = {}
SummonService.__index = SummonService

local MAX_PER_PLAYER = 2
local LIFETIME = 24
local ATTACK_INTERVAL = 2.7
local ATTACK_DAMAGE = {
	girdle_9 = 16,
	nib_and_nuzzle = 18,
	morrowbell = 13,
	foldwyn_pagewing = 14,
	buttongrin = 14,
	sableline = 15,
}

function SummonService.new(world, encounterService, bossService)
	local self = setmetatable({
		world = world,
		encounterService = encounterService,
		bossService = bossService,
		active = {},
		metrics = {},
		lastCallAt = {},
		running = true,
	}, SummonService)
	task.spawn(function() self:runLoop() end)
	return self
end

function SummonService:getCount(userId)
	return #(self.active[userId] or {})
end

function SummonService:getMetrics()
	local copy = {}
	for userId, data in pairs(self.metrics) do
		copy[userId] = table.clone(data)
	end
	return copy
end

function SummonService:ensureMetrics(userId)
	local metrics = self.metrics[userId]
	if not metrics then
		metrics = { counteredAttack = false, weakPointHits = 0, noKnockout = true }
		self.metrics[userId] = metrics
	end
	return metrics
end

function SummonService:call(player, cardId, position)
	local userId = player.UserId
	local list = self.active[userId] or {}
	if #list >= MAX_PER_PLAYER then return false, "summon_limit" end
	local definition = CardCatalog.get(cardId)
	if not definition then return false, "unowned_card" end
	local now = os.clock()
	if now - (self.lastCallAt[userId] or -math.huge) < definition.cooldownSeconds then return false, "cooldown" end
	local model, reason = CreatureBuilder.build(cardId, self.world.Summons, position)
	if not model then return false, reason end
	model:SetAttribute("OwnerUserId", userId)
	model:SetAttribute("Role", definition.role)
	model:SetAttribute("CallNumber", #list + 1)
	self.world.createArrival(position, Color3.fromRGB(74, 191, 176), cardId)
	local summon = {
		model = model,
		cardId = cardId,
		ownerUserId = userId,
		position = position,
		createdAt = now,
		expiresAt = now + LIFETIME,
		nextAttackAt = now + 1.2,
		command = "focus",
		defenseCharges = cardId == "girdle_9" and 2 or ((cardId == "foldwyn_pagewing" or cardId == "buttongrin" or cardId == "sableline") and 1 or 0),
	}
	model:SetAttribute("DefenseCharges", summon.defenseCharges)
	table.insert(list, summon)
	self.active[userId] = list
	self.lastCallAt[userId] = now
	self:ensureMetrics(userId)
	return true
end

function SummonService:command(userId, command)
	if command ~= "follow" and command ~= "hold" and command ~= "focus" then return false end
	local list = self.active[userId]
	if not list then return true end
	for _, summon in ipairs(list) do summon.command = command end
	return true
end

function SummonService:recordCounter(userId)
	self:ensureMetrics(userId).counteredAttack = true
end

function SummonService:recordWeakPointHit(userId)
	local metrics = self:ensureMetrics(userId)
	metrics.weakPointHits += 1
end

function SummonService:markKnockout(userId)
	self:ensureMetrics(userId).noKnockout = false
	self:removePlayer(userId)
end

function SummonService:canCounter(userId, zones)
	local list = self.active[userId]
	if not list then return false end
	for _, summon in ipairs(list) do
		if summon.defenseCharges > 0 then
			summon.defenseCharges -= 1
			summon.model:SetAttribute("DefenseCharges", summon.defenseCharges)
			self:recordCounter(userId)
			if summon.cardId == "buttongrin" or summon.cardId == "sableline" then
				self.bossService:stagger(1.5)
			end
			return true
		end
	end
	return false
end

function SummonService:removePlayer(userId)
	local list = self.active[userId]
	if list then
		for _, summon in ipairs(list) do
			if summon.model and summon.model.Parent then summon.model:Destroy() end
		end
	end
	self.active[userId] = nil
	self.lastCallAt[userId] = nil
end

function SummonService:clearAll()
	for userId in pairs(self.active) do self:removePlayer(userId) end
	self.metrics = {}
	self.lastCallAt = {}
end

function SummonService:runLoop()
	while self.running do
		local now = os.clock()
		for userId, list in pairs(self.active) do
			local player = game:GetService("Players"):GetPlayerByUserId(userId)
			local character = player and player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			for index = #list, 1, -1 do
				local summon = list[index]
				if now >= summon.expiresAt or not summon.model.Parent or not self.encounterService:isParticipant(userId) then
					summon.model:Destroy()
					table.remove(list, index)
				elseif root then
					local bossPosition = self.bossService.model and self.bossService.model.PrimaryPart and self.bossService.model.PrimaryPart.Position
					if summon.command == "follow" then
						local desired = root.Position + Vector3.new((index - 1) * 3 - 1.5, 1.4, 3)
						summon.position = summon.position:Lerp(desired, 0.12)
					elseif summon.command == "focus" and bossPosition then
						local away = summon.position - bossPosition
						if away.Magnitude < 5 then away = Vector3.new(1, 0, 0) end
						local desired = bossPosition + away.Unit * 7 + Vector3.new(0, 1.5, 0)
						summon.position = summon.position:Lerp(desired, 0.06)
					end
					summon.model:PivotTo(CFrame.new(summon.position, bossPosition or summon.position + Vector3.new(0, 0, -1)))
					if now >= summon.nextAttackAt and bossPosition and self.encounterService:getPhase():match("phase") then
						local definition = CardCatalog.get(summon.cardId)
						local previous = self.lastCallAt[userId]
						local combo = summon.cardId == "nib_and_nuzzle" and previous ~= nil and now - previous <= 4
						self.bossService:applySummonHit(summon.cardId, userId, combo)
						summon.nextAttackAt = now + ATTACK_INTERVAL
						if definition and definition.role == "weak point" then
							summon.model:SetAttribute("WeakPointMarked", true)
						end
					end
				end
			end
			if #list == 0 then self.active[userId] = nil end
		end
		task.wait(0.25)
	end
end

return SummonService
