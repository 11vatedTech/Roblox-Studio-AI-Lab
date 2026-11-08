local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local Terrain = workspace.Terrain
local Workspace = game:GetService("Workspace")

local WorldBuilder = {}

local PALETTE = {
	water = Color3.fromRGB(19, 61, 67),
	mud = Color3.fromRGB(48, 59, 50),
	stone = Color3.fromRGB(47, 66, 62),
	leaf = Color3.fromRGB(35, 94, 76),
	leafLight = Color3.fromRGB(57, 128, 102),
	moss = Color3.fromRGB(93, 238, 173),
	bloom = Color3.fromRGB(175, 142, 255),
	quiet = Color3.fromRGB(47, 120, 133),
}

local function makePart(parent: Instance, name: string, size: Vector3, cframe: CFrame, color: Color3, material: Enum.Material, shape: Enum.PartType?): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Anchored = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Color = color
	part.Material = material
	part.Shape = shape or Enum.PartType.Block
	part.Parent = parent
	return part
end

local function addPrompt(parent: BasePart, actionText: string, objectText: string, distance: number): ProximityPrompt
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = actionText
	prompt.ObjectText = objectText
	prompt.HoldDuration = 0.25
	prompt.MaxActivationDistance = distance
	prompt.RequiresLineOfSight = false
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
	prompt.Parent = parent
	return prompt
end

local function createEnvironment()
	Lighting.ClockTime = 1.15
	Lighting.Brightness = 1.8
	Lighting.ExposureCompensation = 0.35
	Lighting.Ambient = Color3.fromRGB(74, 96, 99)
	Lighting.OutdoorAmbient = Color3.fromRGB(56, 76, 83)
	Lighting.EnvironmentDiffuseScale = 0.5
	Lighting.EnvironmentSpecularScale = 0.4

	local atmosphere = Lighting:FindFirstChild("GardenAtmosphere") or Instance.new("Atmosphere")
	atmosphere.Name = "GardenAtmosphere"
	atmosphere.Density = 0.2
	atmosphere.Offset = 0.05
	atmosphere.Color = Color3.fromRGB(146, 202, 183)
	atmosphere.Decay = Color3.fromRGB(31, 68, 81)
	atmosphere.Glare = 0.08
	atmosphere.Haze = 0.8
	atmosphere.Parent = Lighting

	local colorCorrection = Lighting:FindFirstChild("GardenColor") or Instance.new("ColorCorrectionEffect")
	colorCorrection.Name = "GardenColor"
	colorCorrection.TintColor = Color3.fromRGB(172, 222, 205)
	colorCorrection.Contrast = 0.08
	colorCorrection.Saturation = -0.12
	colorCorrection.Parent = Lighting

	local bloom = Lighting:FindFirstChild("GardenBloom") or Instance.new("BloomEffect")
	bloom.Name = "GardenBloom"
	bloom.Intensity = 0.3
	bloom.Size = 24
	bloom.Threshold = 1.35
	bloom.Parent = Lighting

	Terrain:FillBlock(CFrame.new(0, -13, 0), Vector3.new(300, 14, 300), Enum.Material.Mud)
	Terrain:FillBlock(CFrame.new(0, -5.8, 0), Vector3.new(290, 0.6, 290), Enum.Material.Water)
	Terrain.WaterColor = PALETTE.water
	Terrain.WaterTransparency = 0.23
	Terrain.WaterWaveSize = 0.12
	Terrain.WaterWaveSpeed = 7
	for _, island in {
		Vector3.new(0, -12, 0), Vector3.new(0, -12, -75), Vector3.new(74, -12, 0),
		Vector3.new(0, -12, 75), Vector3.new(-74, -12, 0),
	} do
		Terrain:FillBall(island, 17, Enum.Material.Mud)
	end
end

local function createReedCluster(parent: Instance, origin: Vector3, seed: number)
	local random = Random.new(seed)
	for index = 1, 6 do
		local angle = (index / 6) * math.pi * 2 + random:NextNumber(-0.25, 0.25)
		local radius = random:NextNumber(1.2, 3.4)
		local height = random:NextNumber(5, 9)
		local position = origin + Vector3.new(math.cos(angle) * radius, height / 2, math.sin(angle) * radius)
		local reed = makePart(parent, "ReedBlade", Vector3.new(0.5, height, 0.5), CFrame.new(position) * CFrame.Angles(0, angle, math.rad(random:NextNumber(-7, 7))), index % 2 == 0 and PALETTE.leafLight or PALETTE.leaf, Enum.Material.Grass)
		reed.CanCollide = false
	end
end

local function createIsland(parent: Instance, center: Vector3, variant: number)
	local island = Instance.new("Model")
	island.Name = ({ "LanternReedBank", "StillwaterBank", "GlassrootBank", "MoonfernBank" })[variant]
	island.Parent = parent
	local deck = makePart(island, "RootShelf", Vector3.new(48, 3, 44), CFrame.new(center), PALETTE.mud, Enum.Material.Ground)
	deck:SetAttribute("ArtStage", "StylizedBlockout")

	for index = 1, 5 do
		local angle = (index / 5) * math.pi * 2
		local x = center.X + math.cos(angle) * 14
		local z = center.Z + math.sin(angle) * 13
		local trunkHeight = 8 + ((index + variant) % 3)
		local trunk = makePart(island, "ReedStem", Vector3.new(1.2, trunkHeight, 1.2), CFrame.new(x, center.Y + trunkHeight / 2 + 2, z) * CFrame.Angles(0, angle, math.rad(-8 + index * 3)), PALETTE.leaf, Enum.Material.Wood, Enum.PartType.Cylinder)
		trunk.CanCollide = false
		local crown = makePart(island, "ReedCrown", Vector3.new(4, 5, 4), CFrame.new(x + math.cos(angle) * 1.8, center.Y + trunkHeight + 3, z + math.sin(angle) * 1.8), PALETTE.leafLight, Enum.Material.Grass, Enum.PartType.Ball)
		crown.CanCollide = false
		createReedCluster(island, Vector3.new(x - 5, center.Y + 3, z - 4), variant * 100 + index)
	end

	local beaconColor = variant % 2 == 0 and PALETTE.quiet or PALETTE.moss
	local beaconBase = makePart(island, "HabitatBeacon", Vector3.new(3, 12, 3), CFrame.new(center.X, center.Y + 7, center.Z), PALETTE.stone, Enum.Material.Slate)
	local beaconCore = makePart(island, "DormantCore", Vector3.new(4, 4, 4), CFrame.new(center.X, center.Y + 15, center.Z), beaconColor, Enum.Material.Neon, Enum.PartType.Ball)
	beaconCore.CanCollide = false
	beaconCore.Transparency = 0.2
	local light = Instance.new("PointLight")
	light.Name = "HabitatLight"
	light.Color = beaconColor
	light.Brightness = 0.6
	light.Range = 28
	light.Enabled = false
	light.Parent = beaconCore
	return { base = beaconBase, core = beaconCore, light = light }
end

function WorldBuilder.build(config)
	local existing = Workspace:FindFirstChild("SignalGarden")
	if existing then
		assert(existing:IsA("Folder"), "SignalGarden must be a Folder")
		assert(existing:GetAttribute("GeneratedByLab") == "SignalGarden/v1", "Refusing to replace an unowned Workspace.SignalGarden")
		existing:Destroy()
	end
	createEnvironment()

	local field = Instance.new("Folder")
	field.Name = "SignalGarden"
	field:SetAttribute("GeneratedByLab", "SignalGarden/v1")
	field.Parent = Workspace
	local paths = Instance.new("Folder")
	paths.Name = "RootWalkways"
	paths.Parent = field
	local props = Instance.new("Folder")
	props.Name = "MarshLandmarks"
	props.Parent = field
	local gameplay = Instance.new("Folder")
	gameplay.Name = "GameplayNodes"
	gameplay.Parent = field

	local hub = makePart(field, "ArchivePlatform", Vector3.new(44, 5, 44), CFrame.new(0, 6.5, 0), PALETTE.stone, Enum.Material.Slate)
	hub:SetAttribute("ArtStage", "StylizedBlockout")
	local hubTopY = hub.Position.Y + hub.Size.Y / 2
	local archive = makePart(gameplay, "ResonanceArchive", Vector3.new(5, 13, 5), CFrame.new(0, 14, 0), Color3.fromRGB(46, 76, 73), Enum.Material.Slate)
	local archiveRing = makePart(gameplay, "ArchiveRing", Vector3.new(1, 11, 11), CFrame.new(0, 19.5, 0) * CFrame.Angles(0, 0, math.rad(90)), PALETTE.quiet, Enum.Material.Neon, Enum.PartType.Cylinder)
	archiveRing.CanCollide = false
	archiveRing.Transparency = 0.18
	local archiveLight = Instance.new("PointLight")
	archiveLight.Name = "ArchiveLanternLight"
	archiveLight.Color = Color3.fromRGB(145, 235, 211)
	archiveLight.Brightness = 1.4
	archiveLight.Range = 38
	archiveLight.Shadows = false
	archiveLight.Parent = archive
	local archivePrompt = addPrompt(archive, "Deposit echo", "Resonance archive", config.PromptDistance)

	local directions = {
		{ name = "North", center = Vector3.new(0, 8, -75) },
		{ name = "East", center = Vector3.new(75, 8, 0) },
		{ name = "South", center = Vector3.new(0, 8, 75) },
		{ name = "West", center = Vector3.new(-75, 8, 0) },
	}
	local habitats = {}
	local fragments = {}
	local fragmentIndex = 0
	for index, direction in directions do
		local center = direction.center
		local delta = Vector3.new(center.X, 0, center.Z).Unit
		local bridgeCenter = delta * 47
		local bridge = makePart(paths, direction.name .. "RootBridge", Vector3.new(12, 2, 47), CFrame.lookAt(Vector3.new(bridgeCenter.X, 8, bridgeCenter.Z), Vector3.new(bridgeCenter.X, 8, bridgeCenter.Z) + delta), PALETTE.leaf, Enum.Material.WoodPlanks)
		bridge:SetAttribute("ArtStage", "TraversalBlockout")
		local island = createIsland(props, center, index)
		habitats[direction.name] = island
		for fragmentNumber = 1, 2 do
			fragmentIndex += 1
			local offset = fragmentNumber == 1 and Vector3.new(-10, 5, 3) or Vector3.new(10, 5, -4)
			local fragment = makePart(gameplay, string.format("EchoFragment%02d", fragmentIndex), Vector3.new(2.5, 2.5, 2.5), CFrame.new(center + offset), PALETTE.moss, Enum.Material.Neon, Enum.PartType.Ball)
			fragment.CanCollide = false
			fragment:SetAttribute("Collected", false)
			CollectionService:AddTag(fragment, config.FragmentTag)
			addPrompt(fragment, "Gather echo", direction.name .. " bank", config.PromptDistance)
			table.insert(fragments, fragment)
		end
	end

	local routeNodes = {}
	for _, route in { config.RouteNames.Moss, config.RouteNames.Bloom } do
		local color = route == config.RouteNames.Moss and PALETTE.moss or PALETTE.bloom
		local x = route == config.RouteNames.Moss and -11 or 11
		local altar = makePart(gameplay, route .. "RouteAltar", Vector3.new(3, 8, 3), CFrame.new(x, 8, 0), color, Enum.Material.Slate)
		local routePrompt = addPrompt(altar, "Choose " .. route, "Route resonance", config.PromptDistance)
		local leftPosition = Vector3.new(x - 16, 9.6, -12)
		local rightPosition = Vector3.new(x + 16, 9.6, 12)
		local supportSize = Vector3.new(14, 2, 14)
		local function addOuterSupport(suffix: string, position: Vector3)
			if math.abs(position.X) + supportSize.X / 2 <= hub.Size.X / 2 then return end
			local support = makePart(paths, route .. "Switch" .. suffix .. "Support", supportSize, CFrame.new(position.X, hubTopY - supportSize.Y / 2, position.Z), PALETTE.stone, Enum.Material.Slate)
			support.CanCollide = true
			support:SetAttribute("ArtStage", "TraversalBlockout")
			support:SetAttribute("GameplayRole", "CollidableTraversalSupport")
		end
		addOuterSupport("A", leftPosition)
		addOuterSupport("B", rightPosition)
		local left = makePart(gameplay, route .. "SwitchA", Vector3.new(1, 9, 9), CFrame.new(leftPosition) * CFrame.Angles(0, 0, math.rad(90)), color, Enum.Material.Neon, Enum.PartType.Cylinder)
		local right = makePart(gameplay, route .. "SwitchB", Vector3.new(1, 9, 9), CFrame.new(rightPosition) * CFrame.Angles(0, 0, math.rad(90)), color, Enum.Material.Neon, Enum.PartType.Cylinder)
		left.Transparency = 0.5
		right.Transparency = 0.5
		left.CanCollide = false
		right.CanCollide = false
		local leftPrompt = addPrompt(left, "Prime first plate", "Resonance plate", config.PromptDistance)
		local rightPrompt = addPrompt(right, "Prime second plate", "Resonance plate", config.PromptDistance)
		local routeCore = makePart(gameplay, route .. "RouteCore", Vector3.new(3, 3, 3), CFrame.new(x, 20, 0), color, Enum.Material.Neon, Enum.PartType.Ball)
		routeCore.CanCollide = false
		routeCore.Transparency = 0.72
		local routeLight = Instance.new("PointLight")
		routeLight.Name = route .. "RouteLight"
		routeLight.Color = color
		routeLight.Brightness = 0
		routeLight.Range = 24
		routeLight.Parent = routeCore
		routeNodes[route] = { prompt = routePrompt, leftPrompt = leftPrompt, rightPrompt = rightPrompt, left = left, right = right, core = routeCore, light = routeLight }
	end

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "LanternDockSpawn"
	spawn.Size = Vector3.new(18, 2, 18)
	spawn.Position = Vector3.new(0, 10, 27)
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Material = Enum.Material.WoodPlanks
	spawn.Color = Color3.fromRGB(74, 95, 83)
	spawn.Parent = field

	local function setHabitatAwake(isAwake: boolean, route: string?)
		for directionName, habitat in habitats do
			local activated = isAwake and ((route == config.RouteNames.Moss and directionName ~= "South") or (route == config.RouteNames.Bloom and directionName ~= "North"))
			habitat.core.Color = activated and (route == config.RouteNames.Moss and PALETTE.moss or PALETTE.bloom) or PALETTE.quiet
			habitat.core.Transparency = activated and 0.03 or 0.4
			habitat.light.Enabled = true
			habitat.light.Brightness = activated and 2.1 or 0.5
		end
	end

	local function setRouteState(route: string?, firstPressed: string?, secondPressed: string?, choiceEnabled: boolean?)
		for routeName, nodes in routeNodes do
			local active = routeName == route
			nodes.prompt.Enabled = route == nil and choiceEnabled == true
			nodes.leftPrompt.Enabled = active
			nodes.rightPrompt.Enabled = active
			nodes.left.Transparency = active and (firstPressed == "A" and 0.05 or 0.5) or 0.86
			nodes.right.Transparency = active and (secondPressed == "B" and 0.05 or 0.5) or 0.86
			nodes.core.Transparency = active and 0.22 or 0.82
			nodes.light.Brightness = active and 1.1 or 0
		end
	end

	setHabitatAwake(false, nil)
	setRouteState(nil, nil, nil, false)
	return {
		field = field,
		fragments = fragments,
		archivePrompt = archivePrompt,
		routeNodes = routeNodes,
		habitats = habitats,
		setRouteState = setRouteState,
		setHabitatAwake = setHabitatAwake,
	}
end

return WorldBuilder
