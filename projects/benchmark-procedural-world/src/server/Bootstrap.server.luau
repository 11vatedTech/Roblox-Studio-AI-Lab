local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local WorldRules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("WorldRules"))

local folder = Instance.new("Folder")
folder.Name = "ProceduralBenchmark"
folder.Parent = Workspace
local cellSize = 18
local wallHeight = 14
local seed = DateTime.now().UnixTimestamp % 100000

local function makePart(parent, name, size, position, color, material)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.Position = position
	part.Anchored = true
	part.Color = color
	part.Material = material
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

local function build(seedValue)
	folder:ClearAllChildren()
	local generated = assert(WorldRules.generate(seedValue, 8, 8))
	folder:SetAttribute("Seed", seedValue)
	folder:SetAttribute("RoomCount", #generated.cells)
	for index, cell in ipairs(generated.cells) do
		local x = ((index - 1) % generated.width)
		local y = math.floor((index - 1) / generated.width)
		local center = Vector3.new(x * cellSize, 0, -y * cellSize)
		makePart(folder, "RoomFloor" .. index, Vector3.new(cellSize, 1, cellSize), center, Color3.fromRGB(34 + (index % 3) * 8, 47, 69), Enum.Material.Slate)
		if not cell.north then makePart(folder, "NorthWall" .. index, Vector3.new(cellSize, wallHeight, 1), center + Vector3.new(0, wallHeight / 2, -cellSize / 2), Color3.fromRGB(56, 77, 104), Enum.Material.Rock) end
		if not cell.west then makePart(folder, "WestWall" .. index, Vector3.new(1, wallHeight, cellSize), center + Vector3.new(-cellSize / 2, wallHeight / 2, 0), Color3.fromRGB(56, 77, 104), Enum.Material.Rock) end
		if y == generated.height - 1 then makePart(folder, "SouthWall" .. index, Vector3.new(cellSize, wallHeight, 1), center + Vector3.new(0, wallHeight / 2, cellSize / 2), Color3.fromRGB(56, 77, 104), Enum.Material.Rock) end
		if x == generated.width - 1 then makePart(folder, "EastWall" .. index, Vector3.new(1, wallHeight, cellSize), center + Vector3.new(cellSize / 2, wallHeight / 2, 0), Color3.fromRGB(56, 77, 104), Enum.Material.Rock) end
		if index == 1 then
			local start = makePart(folder, "StartBeacon", Vector3.new(4, 7, 4), center + Vector3.new(0, 4, 0), Color3.fromRGB(83, 210, 203), Enum.Material.Neon)
			start:SetAttribute("CriticalLandmark", true)
			local spawn = Instance.new("SpawnLocation")
			spawn.Name = "WorldStart"
			spawn.Size = Vector3.new(7, 1, 7)
			spawn.Position = center + Vector3.new(0, 1, 0)
			spawn.Anchored = true
			spawn.Neutral = true
			spawn.Parent = folder
		end
		if index == #generated.cells then
			local goal = makePart(folder, "GoalBeacon", Vector3.new(5, 9, 5), center + Vector3.new(0, 5, 0), Color3.fromRGB(238, 177, 77), Enum.Material.Neon)
			goal:SetAttribute("CriticalLandmark", true)
			local prompt = Instance.new("ProximityPrompt")
			prompt.Name = "FinishWorld"
			prompt.ActionText = "Finish route"
			prompt.ObjectText = "Generated world exit"
			prompt.HoldDuration = 0
			prompt.MaxActivationDistance = 10
			prompt.Parent = goal
			prompt.Triggered:Connect(function(player)
				local character = player.Character
				local root = character and character:FindFirstChild("HumanoidRootPart")
				if not root or (root.Position - goal.Position).Magnitude > 11 then return end
				player:SetAttribute("GeneratedWorldComplete", true)
				player:SetAttribute("GeneratedWorldSeed", seedValue)
			end)
		end
	end
end

build(seed)
