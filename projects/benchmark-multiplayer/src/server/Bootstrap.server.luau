local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local Rules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("MultiplayerRules"))

local world = Instance.new("Folder")
world.Name = "RelayBenchmark"
world.Parent = Workspace
local function part(name, size, position, color)
	local value = Instance.new("Part")
	value.Name = name
	value.Size = size
	value.Position = position
	value.Anchored = true
	value.Material = Enum.Material.Metal
	value.Color = color
	value.Parent = world
	return value
end
part("Platform", Vector3.new(72, 2, 48), Vector3.new(0, -1, 0), Color3.fromRGB(33, 46, 66))
local spawn = Instance.new("SpawnLocation")
spawn.Name = "RelaySpawn"
spawn.Size = Vector3.new(8, 1, 8)
spawn.Position = Vector3.new(0, 0.5, 16)
spawn.Anchored = true
spawn.Neutral = true
spawn.Parent = world
local barrier = part("RelayGate", Vector3.new(3, 12, 18), Vector3.new(0, 6, -12), Color3.fromRGB(231, 154, 70))
barrier.CanCollide = true
barrier:SetAttribute("Open", false)
local state = { activations = {} }
local lastActivationAt = {}
local pairWindow = 8
local function station(id, position)
	local pad = part("RelayPad_" .. id, Vector3.new(9, 1, 9), position, Color3.fromRGB(71, 173, 188))
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "ActivateRelay"
	prompt.ActionText = "Hold relay"
	prompt.ObjectText = id == "north" and "North relay" or "South relay"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 8
	prompt.RequiresLineOfSight = true
	prompt.Parent = pad
	prompt.Triggered:Connect(function(player)
		local now = os.clock()
		if now - (lastActivationAt[player.UserId] or -10) < 0.5 then return end
		lastActivationAt[player.UserId] = now
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local withinRange = root ~= nil and humanoid ~= nil and humanoid.Health > 0 and (root.Position - pad.Position).Magnitude <= prompt.MaxActivationDistance + 1
		local nextState, reason = Rules.activate(state, player.UserId, id, withinRange, now, pairWindow)
		if not nextState then player:SetAttribute("RelayFeedback", "Rejected: " .. tostring(reason)); return end
		state = nextState
		pad:SetAttribute("ActivatedBy", player.UserId)
		pad:SetAttribute("ActivatedAt", now)
		if state.completed then
			barrier:SetAttribute("Open", true)
			barrier.CanCollide = false
			barrier.Transparency = 0.8
			world:SetAttribute("GateOpen", true)
			world:SetAttribute("LastPairUserIds", tostring(state.activations.north.userId) .. "," .. tostring(state.activations.south.userId))
			for _, participant in ipairs(Players:GetPlayers()) do participant:SetAttribute("RelayFeedback", "GATE OPEN — TWO PLAYER STATES AGREED") end
			task.delay(15, function()
				if not world.Parent then return end
				state = { activations = {} }
				barrier:SetAttribute("Open", false)
				barrier.CanCollide = true
				barrier.Transparency = 0
				world:SetAttribute("GateOpen", false)
				for _, participant in ipairs(Players:GetPlayers()) do participant:SetAttribute("RelayFeedback", "Relay reset — activate both pads with two players") end
			end)
		else
			player:SetAttribute("RelayFeedback", "One pad active — a different player must hold the other")
		end
	end)
end
station("north", Vector3.new(-20, 0, 0))
station("south", Vector3.new(20, 0, 0))

Players.PlayerRemoving:Connect(function(player)
	lastActivationAt[player.UserId] = nil
	for _, activation in pairs(state.activations) do
		if activation.userId == player.UserId then state = { activations = {} }; world:SetAttribute("GateOpen", false); barrier.CanCollide = true; barrier.Transparency = 0 end
	end
end)
