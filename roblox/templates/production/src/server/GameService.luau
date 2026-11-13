--!strict
-- Core loop: collect orbs -> earn Coins -> buy upgrades -> collect faster.
-- Orbs are server-owned parts with ProximityPrompts; the server validates distance and
-- orb state on every trigger, so no client remote can award currency. Purchases and
-- settings go through LabKit.Net contracts. Economy changes are logged to
-- AnalyticsService economy events when available.

local AnalyticsService = game:GetService("AnalyticsService")
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local LabKit = require(ReplicatedStorage:WaitForChild("Packages"):WaitForChild("LabKit"))
local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameConfig = require(Shared:WaitForChild("GameConfig"))
local Rules = require(Shared:WaitForChild("Rules"))
local Remotes = require(Shared:WaitForChild("Remotes"))
local DataService = require(script.Parent:WaitForChild("DataService"))

local GameService = {}

local CURRENCY = GameConfig.currency

local function logEconomy(player: Player, flow: string, amount: number, balance: number, transaction: string, sku: string)
	pcall(function()
		AnalyticsService:LogEconomyEvent(
			player,
			if flow == "source" then Enum.AnalyticsEconomyFlowType.Source else Enum.AnalyticsEconomyFlowType.Sink,
			CURRENCY,
			amount,
			balance,
			transaction,
			sku
		)
	end)
end

local economy = LabKit.Economy.new({
	currencies = { [CURRENCY] = { max = GameConfig.currencyCap, starting = GameConfig.startingCoins } },
})

local net = LabKit.Net.Server.new(Remotes, {
	onReject = function(player, name, reason)
		if reason ~= "rate_limited" then
			warn(string.format("[Net] rejected %s from %s: %s", name, player.Name, reason))
		end
	end,
})

local function pushState(player: Player)
	local profile = DataService.get(player)
	if profile then
		net:fire("State", player, Rules.snapshot(GameConfig, profile.Data))
	end
end

local function applyCharacterStats(player: Player)
	local profile = DataService.get(player)
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if profile and humanoid then
		humanoid.WalkSpeed = Rules.walkSpeed(GameConfig, profile.Data)
	end
end

-- World -----------------------------------------------------------------------

local function buildWorld()
	local existing = Workspace:FindFirstChild("LabProductionField")
	if existing then
		existing:Destroy()
	end
	local field = Instance.new("Folder")
	field.Name = "LabProductionField"
	field.Parent = Workspace

	local ground = Instance.new("Part")
	ground.Name = "Ground"
	ground.Anchored = true
	ground.Size = Vector3.new(GameConfig.world.fieldRadius * 2 + 40, 2, GameConfig.world.fieldRadius * 2 + 40)
	ground.Position = Vector3.new(0, 0, 0)
	ground.Material = Enum.Material.Grass
	ground.Color = Color3.fromRGB(64, 120, 72)
	ground.Parent = field

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "Spawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(10, 1, 10)
	spawn.Position = Vector3.new(0, 1.5, 0)
	spawn.Neutral = true
	spawn.Material = Enum.Material.SmoothPlastic
	spawn.Color = Color3.fromRGB(255, 184, 48)
	spawn.Parent = field

	local rng = LabKit.Rng.new(GameConfig.world.seed)
	for index, position in ipairs(Rules.orbLayout(GameConfig, rng)) do
		local orb = Instance.new("Part")
		orb.Name = string.format("Orb%02d", index)
		orb.Shape = Enum.PartType.Ball
		orb.Size = Vector3.new(2.5, 2.5, 2.5)
		orb.Position = Vector3.new(position.X, position.Y, position.Z)
		orb.Anchored = true
		orb.CanCollide = false
		orb.Material = Enum.Material.Neon
		orb.Color = Color3.fromRGB(96, 165, 250)
		orb:SetAttribute("Active", true)
		orb.Parent = field

		local light = Instance.new("PointLight")
		light.Range = 10
		light.Brightness = 1.5
		light.Color = orb.Color
		light.Parent = orb

		local prompt = Instance.new("ProximityPrompt")
		prompt.ActionText = "Collect"
		prompt.ObjectText = "Orb"
		prompt.HoldDuration = 0
		prompt.RequiresLineOfSight = false
		prompt.MaxActivationDistance = GameConfig.world.collectDistance + GameConfig.upgrades.Magnet.maxLevel * GameConfig.upgrades.Magnet.effectPerLevel
		prompt.Parent = orb

		prompt.Triggered:Connect(function(player: Player)
			GameService.collect(player, orb, prompt)
		end)
	end
	return field
end

function GameService.collect(player: Player, orb: BasePart, prompt: ProximityPrompt)
	local profile = DataService.get(player)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if profile == nil or root == nil or not root:IsA("BasePart") then
		return
	end
	local ok = Rules.canCollect(GameConfig, profile.Data, root.Position, orb.Position, orb:GetAttribute("Active") == true)
	if not ok then
		return
	end
	orb:SetAttribute("Active", false)
	orb.Transparency = 1
	prompt.Enabled = false
	local reward = Rules.orbReward(GameConfig, profile.Data)
	economy:grant(profile.Data, CURRENCY, reward, { reason = "orb" })
	profile.Data.stats.orbsCollected += 1
	logEconomy(player, "source", reward, economy:balance(profile.Data, CURRENCY), "Gameplay", "orb")
	pushState(player)
	task.delay(GameConfig.world.respawnSeconds, function()
		if orb.Parent then
			orb:SetAttribute("Active", true)
			orb.Transparency = 0
			prompt.Enabled = true
		end
	end)
end

-- Remotes -----------------------------------------------------------------------

net:handle("BuyUpgrade", function(player: Player, upgradeId: string)
	local profile = DataService.get(player)
	if profile == nil then
		return false, "not_loaded"
	end
	local level = Rules.level(profile.Data, upgradeId)
	local cost, reason = Rules.upgradeCost(GameConfig, upgradeId, level)
	if cost == nil then
		return false, reason
	end
	local ok, purchaseReason = economy:purchase(profile.Data, { [CURRENCY] = cost }, function(data)
		data.upgrades[upgradeId] = level + 1
		return true
	end, { reason = "upgrade:" .. upgradeId })
	if not ok then
		return false, purchaseReason
	end
	logEconomy(player, "sink", cost, economy:balance(profile.Data, CURRENCY), "Shop", upgradeId)
	applyCharacterStats(player)
	pushState(player)
	net:fire("Toast", player, GameConfig.upgrades[upgradeId].displayName .. " upgraded to level " .. (level + 1))
	return true, Rules.snapshot(GameConfig, profile.Data)
end)

net:handle("UpdateSettings", function(player: Player, settings)
	local profile = DataService.get(player)
	if profile then
		profile.Data.settings = { music = settings.music, sfx = settings.sfx, reducedMotion = settings.reducedMotion }
	end
end)

net:handle("GetState", function(player: Player)
	local profile = DataService.get(player)
	if profile == nil then
		return false, "not_loaded"
	end
	return true, Rules.snapshot(GameConfig, profile.Data)
end)

-- Monetization (disabled until product IDs are configured) -----------------------

local function bindReceipts()
	local handlers = {}
	for _, product in pairs(GameConfig.products) do
		if product.productId ~= nil then
			handlers[product.productId] = function(profile)
				local ok = economy:grant(profile.Data, CURRENCY, product.coins, { reason = "robux_pack" })
				return ok
			end
		end
	end
	if next(handlers) == nil then
		return
	end
	local receipts = LabKit.Receipts.new({
		getProfile = function(userId)
			return DataService.store:get(tostring(userId))
		end,
		products = handlers,
	})
	MarketplaceService.ProcessReceipt = LabKit.Receipts.bind(receipts)
end

function GameService.start()
	buildWorld()
	bindReceipts()
	DataService.Loaded:Connect(function(player: Player)
		player.CharacterAdded:Connect(function()
			task.defer(applyCharacterStats, player)
		end)
		applyCharacterStats(player)
		pushState(player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		net:removePlayer(player)
	end)
end

return GameService
