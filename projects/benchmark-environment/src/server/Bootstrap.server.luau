local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local Rules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("EnvironmentRules"))

local world = Instance.new("Folder")
world.Name = "EnvironmentBenchmark"
world.Parent = Workspace
local landmarks = { spawn = true, goal = true, hazard = true }
assert(Rules.validateScene({ landmarks = landmarks, details = 96 }), "benchmark environment missing a required gameplay landmark")

local function part(parent, name, size, position, color, material, tier)
	local value = Instance.new("Part")
	value.Name = name
	value.Size = size
	value.Position = position
	value.Anchored = true
	value.Color = color
	value.Material = material
	value.TopSurface = Enum.SurfaceType.Smooth
	value.BottomSurface = Enum.SurfaceType.Smooth
	if tier then value:SetAttribute("QualityTier", tier) end
	value.Parent = parent
	return value
end

part(world, "Ground", Vector3.new(150, 2, 120), Vector3.new(0, -1, 0), Color3.fromRGB(29, 41, 59), Enum.Material.Slate)
local spawn = Instance.new("SpawnLocation")
spawn.Name = "ReadableSpawn"
spawn.Size = Vector3.new(10, 1, 10)
spawn.Position = Vector3.new(-58, 0.5, 38)
spawn.Anchored = true
spawn.Neutral = true
spawn.Parent = world
spawn:SetAttribute("CriticalLandmark", true)
local goal = part(world, "GoalTower", Vector3.new(10, 24, 10), Vector3.new(58, 12, -38), Color3.fromRGB(233, 178, 77), Enum.Material.Neon)
goal:SetAttribute("CriticalLandmark", true)
local hazard = part(world, "HazardMarker", Vector3.new(18, 1, 18), Vector3.new(0, 0, 0), Color3.fromRGB(217, 82, 75), Enum.Material.Neon)
hazard:SetAttribute("CriticalLandmark", true)
local ring = part(world, "DistantLandmark", Vector3.new(4, 34, 4), Vector3.new(0, 17, -52), Color3.fromRGB(72, 171, 191), Enum.Material.Metal)
ring:SetAttribute("CriticalLandmark", true)

local details = Instance.new("Folder")
details.Name = "TieredDetails"
details.Parent = world
local index = 0
for x = -4, 4 do
	for z = -3, 3 do
		if (math.abs(x) >= 3 or math.abs(z) >= 2) and (x * x + z * z) % 3 ~= 0 then
			index += 1
			local position = Vector3.new(x * 13, 1, z * 13)
			local trunk = part(details, "CanopyTrunk" .. index, Vector3.new(1.2, 5, 1.2), position + Vector3.new(0, 2.5, 0), Color3.fromRGB(104, 80, 64), Enum.Material.Wood, "medium")
			local canopy = part(details, "Canopy" .. index, Vector3.new(7, 5, 7), position + Vector3.new(0, 6.5, 0), Color3.fromRGB(59 + (index % 3) * 12, 128, 113), Enum.Material.Grass, "medium")
			canopy.Shape = Enum.PartType.Ball
			local rune = part(details, "FloatingRune" .. index, Vector3.new(0.5, 0.5, 0.5), position + Vector3.new(0, 11, 0), Color3.fromRGB(107, 227, 219), Enum.Material.Neon, "high")
			rune.Shape = Enum.PartType.Ball
		end
	end
end
for _, position in ipairs({ Vector3.new(-38, 9, -35), Vector3.new(38, 9, 35), Vector3.new(-22, 9, 38) }) do
	local lightPart = part(details, "QualityBeacon", Vector3.new(2, 2, 2), position, Color3.fromRGB(94, 203, 219), Enum.Material.Glass, "high")
	lightPart.Shape = Enum.PartType.Ball
	local light = Instance.new("PointLight")
	light.Name = "HighTierLight"
	light.Color = lightPart.Color
	light.Brightness = 1.5
	light.Range = 14
	light.Enabled = false
	light.Parent = lightPart
end
world:SetAttribute("CriticalLandmarkCount", 4)
world:SetAttribute("DecorationCount", index * 3 + 3)
