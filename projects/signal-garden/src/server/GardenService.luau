local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage:WaitForChild("GardenConfig"))
local WorldBuilder = require(script.Parent.WorldBuilder)

local GardenService = {}
local started = false
local playerCooldowns: { [Player]: number } = {}
local stateRequestAt: { [Player]: number } = {}
local stateRemote: RemoteEvent
local requestRemote: RemoteEvent
local world
local state = {
	phase = "gather",
	deposits = 0,
	route = nil :: string?,
	firstPlate = nil :: number?,
	secondPlate = nil :: number?,
	completedRuns = 0,
	deadline = 0,
}
local resetTicket = 0

local function getOrCreateRemote(name: string): RemoteEvent
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

local function getRoot(player: Player): BasePart?
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then return root end
	return nil
end

local function near(player: Player, target: Instance, maxDistance: number): boolean
	if not target:IsA("BasePart") or not target:IsDescendantOf(world.field) then return false end
	local root = getRoot(player)
	if not root then return false end
	return (root.Position - target.Position).Magnitude <= maxDistance
end

local function playerValue(player: Player, valueName: string): IntValue?
	local leaderstats = player:FindFirstChild("leaderstats")
	local value = leaderstats and leaderstats:FindFirstChild(valueName)
	if value and value:IsA("IntValue") then return value end
	return nil
end

local function ensureStats(player: Player)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		leaderstats = Instance.new("Folder")
		leaderstats.Name = "leaderstats"
		leaderstats.Parent = player
	end
	for _, name in { "Echoes", "Restorations" } do
		local value = leaderstats:FindFirstChild(name)
		if not value then
			value = Instance.new("IntValue")
			value.Name = name
			value.Value = 0
			value.Parent = leaderstats
		end
	end
end

local function snapshot(player: Player?)
	local echoes = player and playerValue(player, "Echoes")
	return {
		phase = state.phase,
		deposits = state.deposits,
		requiredDeposits = Config.RequiredDeposits,
		route = state.route,
		firstPlateActive = state.firstPlate ~= nil,
		secondPlateActive = state.secondPlate ~= nil,
		secondsRemaining = state.deadline > 0 and math.max(0, math.ceil(state.deadline - os.clock())) or 0,
		completedRuns = state.completedRuns,
		playerEchoes = echoes and echoes.Value or 0,
	}
end

local function sendState(player: Player, message: string?)
	stateRemote:FireClient(player, { kind = "state", state = snapshot(player), message = message })
end

local function broadcast(message: string?)
	for _, player in Players:GetPlayers() do
		sendState(player, message)
	end
end

local function allowAction(player: Player, target: Instance): boolean
	if player.Parent ~= Players or not near(player, target, Config.PromptDistance + 1.5) then return false end
	local now = os.clock()
	local previous = playerCooldowns[player] or 0
	if now - previous < Config.PlayerActionCooldown then return false end
	playerCooldowns[player] = now
	return true
end

local function restoreRoute(route: string)
	state.phase = "restored"
	state.completedRuns += 1
	state.deadline = 0
	world.setRouteState(nil, nil, nil, false)
	world.setHabitatAwake(true, route)
	for _, player in Players:GetPlayers() do
		local restorations = playerValue(player, "Restorations")
		if restorations then restorations.Value += 1 end
	end
	broadcast(route .. " route restored. The habitat is singing again.")
	resetTicket += 1
	local ticket = resetTicket
	task.delay(Config.ResetSeconds, function()
		if ticket ~= resetTicket or not world.field.Parent then return end
		state.phase = "gather"
		state.deposits = 0
		state.route = nil
		state.firstPlate = nil
		state.secondPlate = nil
		world.setHabitatAwake(false, nil)
		world.setRouteState(nil, nil, nil, false)
		broadcast("The archive is ready for another expedition.")
	end)
end

local function activatePlate(player: Player, plate: "A" | "B", prompt: ProximityPrompt)
	if not allowAction(player, prompt.Parent) or state.phase ~= "relay" or state.deadline <= os.clock() or not state.route then return end
	if plate == "A" then
		if state.firstPlate then return end
		state.firstPlate = player.UserId
	else
		if state.secondPlate then return end
		state.secondPlate = player.UserId
	end
	local enoughPlayers = #Players:GetPlayers() < 2
	local distinctPlayers = state.firstPlate ~= nil and state.secondPlate ~= nil and state.firstPlate ~= state.secondPlate
	if state.firstPlate ~= nil and state.secondPlate ~= nil and (enoughPlayers or distinctPlayers) then
		restoreRoute(state.route)
		return
	end
	world.setRouteState(state.route, state.firstPlate and "A" or nil, state.secondPlate and "B" or nil, false)
	broadcast("One plate is resonating. The other needs a partner.")
end

local function attachRoutePrompts()
	for route, nodes in world.routeNodes do
		nodes.prompt.Triggered:Connect(function(player: Player)
			if not allowAction(player, nodes.prompt.Parent) or state.phase ~= "choose" or state.deposits < Config.RequiredDeposits then return end
			state.route = route
			state.phase = "relay"
			state.deadline = os.clock() + Config.RouteWindowSeconds
			state.firstPlate = nil
			state.secondPlate = nil
			world.setHabitatAwake(false, nil)
			world.setRouteState(route, nil, nil, false)
			broadcast(route .. " route chosen. Prime both plates before the resonance fades.")
			local expectedRoute = route
			task.delay(Config.RouteWindowSeconds, function()
				if state.phase ~= "relay" or state.route ~= expectedRoute or state.deadline > os.clock() then return end
				state.phase = "choose"
				state.route = nil
				state.firstPlate = nil
				state.secondPlate = nil
				state.deadline = 0
				world.setRouteState(nil, nil, nil, true)
				broadcast("The resonance faded. Choose a route and try the relay again.")
			end)
		end)
		nodes.leftPrompt.Triggered:Connect(function(player: Player) activatePlate(player, "A", nodes.leftPrompt) end)
		nodes.rightPrompt.Triggered:Connect(function(player: Player) activatePlate(player, "B", nodes.rightPrompt) end)
	end
end

local function attachFragments()
	for _, fragment in world.fragments do
		local prompt = fragment:FindFirstChildOfClass("ProximityPrompt")
		assert(prompt, "Every Echo fragment needs a collection prompt")
		prompt.Triggered:Connect(function(player: Player)
			if not allowAction(player, fragment) or not CollectionService:HasTag(fragment, Config.FragmentTag) or fragment:GetAttribute("Collected") == true then return end
			local echoes = playerValue(player, "Echoes")
			if not echoes or echoes.Value >= 12 then return end
			fragment:SetAttribute("Collected", true)
			CollectionService:RemoveTag(fragment, Config.FragmentTag)
			fragment.Transparency = 1
			prompt.Enabled = false
			echoes.Value += 1
			sendState(player, "Echo gathered. Bring it to the central archive.")
			task.delay(Config.FragmentRespawnSeconds, function()
				if not fragment.Parent or not prompt.Parent then return end
				fragment:SetAttribute("Collected", false)
				fragment.Transparency = 0
				CollectionService:AddTag(fragment, Config.FragmentTag)
				prompt.Enabled = true
			end)
		end)
	end
end

local function attachArchive()
	world.archivePrompt.Triggered:Connect(function(player: Player)
		if not allowAction(player, world.archivePrompt.Parent) then return end
		local echoes = playerValue(player, "Echoes")
		if not echoes or echoes.Value <= 0 or state.phase == "relay" or state.phase == "restored" then
			sendState(player, state.phase == "relay" and "Complete the active relay first." or "Gather an Echo before returning to the archive.")
			return
		end
		if state.deposits >= Config.RequiredDeposits then
			sendState(player, "The archive is charged. Choose Moss or Bloom.")
			return
		end
		echoes.Value -= 1
		state.deposits += 1
		if state.deposits >= Config.RequiredDeposits then
			state.phase = "choose"
			world.setRouteState(nil, nil, nil, true)
		end
		broadcast(state.deposits >= Config.RequiredDeposits and "The archive is charged. Choose a route." or string.format("Archive charge %d of %d.", state.deposits, Config.RequiredDeposits))
	end)
end

local function setupPlayer(player: Player)
	ensureStats(player)
	player.CharacterAdded:Connect(function()
		task.defer(function() if player.Parent == Players then sendState(player) end end)
	end)
	sendState(player, "Welcome to the marsh. Find three Echoes to charge the archive.")
end

function GardenService.start()
	assert(not started, "GardenService.start may only run once")
	assert(RunService:IsServer(), "GardenService must start on the server")
	started = true
	stateRemote = getOrCreateRemote(Config.StateRemoteName)
	requestRemote = getOrCreateRemote(Config.RequestRemoteName)
	world = WorldBuilder.build(Config)
	Players.PlayerAdded:Connect(setupPlayer)
	Players.PlayerRemoving:Connect(function(player)
		playerCooldowns[player] = nil
		stateRequestAt[player] = nil
	end)
	for _, player in Players:GetPlayers() do setupPlayer(player) end
	requestRemote.OnServerEvent:Connect(function(player: Player)
		local now = os.clock()
		if player.Parent ~= Players or now - (stateRequestAt[player] or 0) < 1 then return end
		stateRequestAt[player] = now
		sendState(player)
	end)
	attachFragments()
	attachArchive()
	attachRoutePrompts()
	broadcast("Find three Echoes to charge the archive.")
end

return GardenService
