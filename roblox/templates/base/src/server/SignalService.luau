local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local Constants = require(ReplicatedStorage:WaitForChild("SignalConstants"))

local FIELD_NAME = "LabSignalField"

local SignalService = {}
local lastRequestAt: { [Player]: number } = {}

local function getOrCreateRemoteEvent(name: string): RemoteEvent
	local existing = ReplicatedStorage:FindFirstChild(name)
	if existing then
		assert(existing:IsA("RemoteEvent"), string.format("%s must be a RemoteEvent", name))
		return existing
	end

	local remote = Instance.new("RemoteEvent")
	remote.Name = name
	remote.Parent = ReplicatedStorage
	return remote
end

local function createField(): Folder
	local existing = Workspace:FindFirstChild(FIELD_NAME)
	if existing then
		assert(existing:IsA("Folder"), string.format("%s must be a Folder", FIELD_NAME))
		return existing
	end

	local field = Instance.new("Folder")
	field.Name = FIELD_NAME
	field.Parent = Workspace

	local platform = Instance.new("Part")
	platform.Name = "ValidationPlatform"
	platform.Size = Vector3.new(60, 2, 60)
	platform.Position = Vector3.new(0, 2, 0)
	platform.Anchored = true
	platform.Material = Enum.Material.Slate
	platform.Color = Color3.fromRGB(28, 46, 46)
	platform:SetAttribute("LabGraybox", true)
	platform.Parent = field

	for index, position in ipairs({
		Vector3.new(-12, 5, -8),
		Vector3.new(0, 5, 12),
		Vector3.new(13, 5, -6),
	}) do
		local fragment = Instance.new("Part")
		fragment.Name = string.format("SignalFragment%02d", index)
		fragment.Shape = Enum.PartType.Ball
		fragment.Size = Vector3.new(2, 2, 2)
		fragment.Position = position
		fragment.Anchored = true
		fragment.CanCollide = false
		fragment.Material = Enum.Material.Neon
		fragment.Color = Color3.fromRGB(77, 225, 181)
		fragment:SetAttribute("LabGraybox", true)
		fragment.Parent = field
		CollectionService:AddTag(fragment, Constants.FragmentTag)

		local prompt = Instance.new("ProximityPrompt")
		prompt.ActionText = "Collect signal"
		prompt.ObjectText = "Signal fragment"
		prompt.HoldDuration = 0
		prompt.MaxActivationDistance = Constants.CollectionDistance
		prompt.RequiresLineOfSight = false
		prompt.Parent = fragment
	end

	return field
end

local function ensureLeaderstats(player: Player)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		leaderstats = Instance.new("Folder")
		leaderstats.Name = "leaderstats"
		leaderstats.Parent = player
	end

	local signals = leaderstats:FindFirstChild("Signals")
	if not signals then
		signals = Instance.new("IntValue")
		signals.Name = "Signals"
		signals.Value = 0
		signals.Parent = leaderstats
	end
end

local function isValidCollection(player: Player, target: any, field: Folder): boolean
	if typeof(target) ~= "Instance" or not target:IsA("BasePart") then
		return false
	end
	if not target:IsDescendantOf(field) or not CollectionService:HasTag(target, Constants.FragmentTag) then
		return false
	end
	if target:GetAttribute("Collected") == true then
		return false
	end
	local character = player.Character
	local rootPart = character and character:FindFirstChild("HumanoidRootPart")
	if not rootPart or not rootPart:IsA("BasePart") then
		return false
	end
	return (rootPart.Position - target.Position).Magnitude <= Constants.CollectionDistance
end

local function collect(player: Player, target: any, field: Folder, feedback: RemoteEvent)
	local now = os.clock()
	local previous = lastRequestAt[player] or 0
	if now - previous < Constants.RequestCooldown then
		return
	end
	lastRequestAt[player] = now

	if not isValidCollection(player, target, field) then
		return
	end

	local leaderstats = player:FindFirstChild("leaderstats")
	local signals = leaderstats and leaderstats:FindFirstChild("Signals")
	if not signals or not signals:IsA("IntValue") then
		return
	end

	target:SetAttribute("Collected", true)
	CollectionService:RemoveTag(target, Constants.FragmentTag)
	target.Transparency = 1
	local prompt = target:FindFirstChildOfClass("ProximityPrompt")
	if prompt then
		prompt.Enabled = false
	end

	signals.Value += 1
	feedback:FireClient(player, { kind = "signal_collected", count = signals.Value })

	task.delay(Constants.RespawnSeconds, function()
		if not target.Parent then
			return
		end
		target.Transparency = 0
		target:SetAttribute("Collected", false)
		CollectionService:AddTag(target, Constants.FragmentTag)
		if prompt and prompt.Parent then
			prompt.Enabled = true
		end
	end)
end

function SignalService.start()
	local field = createField()
	local collectRemote = getOrCreateRemoteEvent(Constants.CollectRemoteName)
	local feedbackRemote = getOrCreateRemoteEvent(Constants.FeedbackRemoteName)

	Players.PlayerAdded:Connect(ensureLeaderstats)
	Players.PlayerRemoving:Connect(function(player)
		lastRequestAt[player] = nil
	end)
	for _, player in Players:GetPlayers() do
		ensureLeaderstats(player)
	end
	collectRemote.OnServerEvent:Connect(function(player, target)
		collect(player, target, field, feedbackRemote)
	end)
end

return SignalService
