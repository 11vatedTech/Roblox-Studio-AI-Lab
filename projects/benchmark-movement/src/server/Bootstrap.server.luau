local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local Rules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("MovementRules"))

local world = Instance.new("Folder")
world.Name = "MovementBenchmark"
world.Parent = Workspace
local function platform(name, size, position, color)
	local value = Instance.new("Part")
	value.Name = name
	value.Size = size
	value.Position = position
	value.Anchored = true
	value.Material = Enum.Material.Slate
	value.Color = color
	value.TopSurface = Enum.SurfaceType.Smooth
	value.BottomSurface = Enum.SurfaceType.Smooth
	value.Parent = world
	return value
end
platform("Start", Vector3.new(22, 2, 22), Vector3.new(0, -1, 0), Color3.fromRGB(46, 78, 103))
platform("StepOne", Vector3.new(8, 2, 8), Vector3.new(0, 2, -18), Color3.fromRGB(65, 139, 155))
platform("StepTwo", Vector3.new(8, 2, 8), Vector3.new(10, 5, -34), Color3.fromRGB(97, 162, 136))
platform("Finish", Vector3.new(16, 2, 16), Vector3.new(0, 8, -50), Color3.fromRGB(232, 174, 78))

local checkpoints = {}
for index, position in ipairs({ Vector3.new(0, 4, -18), Vector3.new(10, 7, -34), Vector3.new(0, 10, -50) }) do
	local marker = platform("Checkpoint" .. index, Vector3.new(4, 0.5, 4), position, Color3.fromRGB(206, 241, 244))
	marker.Transparency = 0.2
	marker:SetAttribute("CheckpointIndex", index)
	table.insert(checkpoints, marker)
end

local progress = {}
local function resetPlayer(player)
	local now = os.clock()
	progress[player.UserId] = { nextCheckpoint = 1, lastCheckpointAt = now, finishIndex = #checkpoints }
	player:SetAttribute("ParkourCheckpoint", 0)
	player:SetAttribute("ParkourComplete", false)
end
Players.PlayerAdded:Connect(resetPlayer)
Players.PlayerRemoving:Connect(function(player) progress[player.UserId] = nil end)
for _, player in ipairs(Players:GetPlayers()) do resetPlayer(player) end

for _, checkpoint in ipairs(checkpoints) do
	checkpoint.Touched:Connect(function(hit)
		local character = hit:FindFirstAncestorOfClass("Model")
		local player = character and Players:GetPlayerFromCharacter(character)
		local root = character and character:FindFirstChild("HumanoidRootPart")
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local index = checkpoint:GetAttribute("CheckpointIndex")
		local state = player and progress[player.UserId]
		if not player or not root or not humanoid or humanoid.Health <= 0 or not state then return end
		local now = os.clock()
		if (root.Position - checkpoint.Position).Magnitude > 7 then return end
		local previousPosition = index == 1 and Vector3.new(0, 4, 0) or checkpoints[index - 1].Position
		local distance = (root.Position - previousPosition).Magnitude
		local elapsed = now - state.lastCheckpointAt
		local plausible = Rules.validateDisplacement(0, distance, math.max(elapsed, 0.05), 85)
		if not plausible then return end
		local nextState = Rules.validateCheckpoint(state, index, (root.Position - checkpoint.Position).Magnitude, now, 7, 60)
		if not nextState then return end
		progress[player.UserId] = nextState
		player:SetAttribute("ParkourCheckpoint", index)
		if nextState.completed then player:SetAttribute("ParkourComplete", true) end
	end)
end
