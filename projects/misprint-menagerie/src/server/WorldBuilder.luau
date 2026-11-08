local CreatureBuilder = require(script.Parent:WaitForChild("CreatureBuilder"))
local CardCatalog = require(game:GetService("ReplicatedStorage"):WaitForChild("MisprintShared"):WaitForChild("CardCatalog"))

local WorldBuilder = {}

local COLORS = {
	ink = Color3.fromRGB(31, 31, 45),
	paper = Color3.fromRGB(239, 219, 177),
	cream = Color3.fromRGB(249, 236, 203),
	coral = Color3.fromRGB(201, 91, 82),
	teal = Color3.fromRGB(81, 170, 157),
	blue = Color3.fromRGB(103, 126, 157),
}

local function addPart(parent, name, size, position, color, material, shape, transparency, canCollide)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = CFrame.new(position)
	part.Color = color
	part.Material = material or Enum.Material.SmoothPlastic
	part.Anchored = true
	part.CanCollide = canCollide == true
	part.CanTouch = false
	part.CanQuery = false
	part.CastShadow = false
	part.Transparency = transparency or 0
	if shape then
		part.Shape = shape
	end
	part.Parent = parent
	return part
end

local function addLabel(part, text, color)
	local billboard = Instance.new("BillboardGui")
	billboard.Name = "ReadMeLabel"
	billboard.Size = UDim2.fromOffset(240, 50)
	billboard.StudsOffset = Vector3.new(0, 2.5, 0)
	billboard.AlwaysOnTop = true
	billboard.Parent = part
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.Font = Enum.Font.GothamBold
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.TextStrokeTransparency = 0.45
	label.Parent = billboard
end

local function addCardPlaque(parent, card, position)
	local plaque = addPart(parent, "CardPlaque_" .. card.id, Vector3.new(10, 5.4, 0.5), position, COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, true)
	local surface = Instance.new("SurfaceGui")
	surface.Name = "CardCaption"
	surface.Face = Enum.NormalId.Back
	surface.CanvasSize = Vector2.new(600, 324)
	surface.LightInfluence = 0
	surface.AlwaysOnTop = true
	surface.Parent = plaque
	local title = Instance.new("TextLabel")
	title.Name = "CardName"
	title.BackgroundTransparency = 1
	title.Position = UDim2.new(0.06, 0, 0.14, 0)
	title.Size = UDim2.new(0.88, 0, 0.46, 0)
	title.Font = Enum.Font.GothamBlack
	title.Text = card.displayName
	title.TextColor3 = COLORS.cream
	title.TextScaled = true
	title.TextWrapped = true
	title.Parent = surface
	local identity = Instance.new("TextLabel")
	identity.Name = "CardRole"
	identity.BackgroundTransparency = 1
	identity.Position = UDim2.new(0.06, 0, 0.63, 0)
	identity.Size = UDim2.new(0.88, 0, 0.2, 0)
	identity.Font = Enum.Font.GothamBold
	identity.Text = string.upper(card.style) .. "  ·  " .. string.upper(card.role)
	identity.TextColor3 = Color3.fromRGB(117, 212, 194)
	identity.TextScaled = true
	identity.TextWrapped = true
	identity.Parent = surface
end

local function setArchiveLighting()
	local lighting = game:GetService("Lighting")
	lighting.ClockTime = 16.4
	lighting.Brightness = 2
	lighting.Ambient = Color3.fromRGB(92, 83, 98)
	lighting.OutdoorAmbient = Color3.fromRGB(129, 120, 132)
	lighting.ColorShift_Top = Color3.fromRGB(255, 218, 185)
	lighting.ColorShift_Bottom = Color3.fromRGB(106, 133, 153)
	if not lighting:FindFirstChild("MisprintAtmosphere") then
		local atmosphere = Instance.new("Atmosphere")
		atmosphere.Name = "MisprintAtmosphere"
		atmosphere.Color = Color3.fromRGB(219, 196, 186)
		atmosphere.Decay = Color3.fromRGB(111, 120, 153)
		atmosphere.Density = 0.18
		atmosphere.Haze = 0.9
		atmosphere.Glare = 0.08
		atmosphere.Parent = lighting
	end
	if not lighting:FindFirstChild("MisprintColorGrade") then
		local grade = Instance.new("ColorCorrectionEffect")
		grade.Name = "MisprintColorGrade"
		grade.Brightness = -0.015
		grade.Contrast = 0.08
		grade.Saturation = -0.035
		grade.TintColor = Color3.fromRGB(255, 243, 222)
		grade.Parent = lighting
	end
end

function WorldBuilder.build(config)
	local existing = workspace:FindFirstChild("MisprintWorld")
	assert(not existing, "Workspace.MisprintWorld already exists; refusing to replace existing scene")
	local root = Instance.new("Folder")
	root.Name = "MisprintWorld"
	root.Parent = workspace
	setArchiveLighting()
	local index = Instance.new("Folder")
	index.Name = "TheIndex"
	index.Parent = root
	local arena = Instance.new("Folder")
	arena.Name = "RedactorArena"
	arena.Parent = root
	local telegraphs = Instance.new("Folder")
	telegraphs.Name = "Telegraphs"
	telegraphs.Parent = arena
	local summons = Instance.new("Folder")
	summons.Name = "Summons"
	summons.Parent = arena
	local showcase = Instance.new("Folder")
	showcase.Name = "CardShowcase"
	showcase.Parent = index

	-- A layered paper hub, set apart from the combat board.
	addPart(index, "IndexInkMat", Vector3.new(72, 2, 48), Vector3.new(0, -1, 82), COLORS.ink, Enum.Material.Slate, nil, 0, true)
	addPart(index, "IndexPaper", Vector3.new(68, 0.3, 44), Vector3.new(0, 0.15, 82), COLORS.paper, Enum.Material.Cardboard, nil, 0, true)
	addPart(index, "ArchiveRuleNorth", Vector3.new(68, 0.2, 0.7), Vector3.new(0, 0.42, 103), COLORS.coral, Enum.Material.Neon)
	addPart(index, "ArchiveRuleSouth", Vector3.new(68, 0.2, 0.7), Vector3.new(0, 0.42, 61), COLORS.teal, Enum.Material.Neon)
	for i = 1, 4 do
		addPart(index, "IndexPrintLayer" .. i, Vector3.new(7, 0.55, 0.65), Vector3.new(-23 + (i - 1) * 15, 0.5, 82), i % 2 == 0 and COLORS.teal or COLORS.coral, Enum.Material.Cardboard)
	end
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "IndexSpawn"
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.CFrame = CFrame.new(0, 0.8, 103)
	spawn.Color = COLORS.cream
	spawn.Material = Enum.Material.Cardboard
	spawn.Transparency = 0.12
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Parent = index

	local portal = addPart(index, "IndexPortal", Vector3.new(5, 10, 2), Vector3.new(0, 5, 61), COLORS.teal, Enum.Material.Neon, Enum.PartType.Block, 0.25, false)
	portal.CanTouch = true
	addPart(index, "PortalLeftInk", Vector3.new(1.2, 13, 2.4), Vector3.new(-4.1, 6.2, 61), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, true)
	addPart(index, "PortalRightInk", Vector3.new(1.2, 13, 2.4), Vector3.new(4.1, 6.2, 61), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, true)
	addPart(index, "PortalHeader", Vector3.new(9.3, 1.5, 2.4), Vector3.new(0, 12.7, 61), COLORS.coral, Enum.Material.Cardboard, Enum.PartType.Block, 0, true)
	addLabel(portal, "THE REDACTOR · HUNT PORTAL", COLORS.cream)
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "JoinHuntPrompt"
	prompt.ActionText = "Join the hunt"
	prompt.ObjectText = "The Redactor"
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 13
	prompt.RequiresLineOfSight = false
	prompt.Parent = portal

	addPart(index, "IndexHeading", Vector3.new(18, 7, 1), Vector3.new(0, 10, 88), COLORS.ink, Enum.Material.Cardboard, Enum.PartType.Block, 0, false)
	addLabel(index:FindFirstChild("IndexHeading"), "THE INDEX  /  MISPRINT ARCHIVE", COLORS.cream)
	for i, cardId in ipairs({ "girdle_9", "nib_and_nuzzle", "morrowbell", "foldwyn_pagewing", "buttongrin", "sableline" }) do
		local x = -24 + ((i - 1) % 3) * 24
		local z = 74 + math.floor((i - 1) / 3) * 16
		addPart(showcase, "CardStand_" .. cardId, Vector3.new(7, 0.7, 6), Vector3.new(x, 0.65, z), COLORS.cream, Enum.Material.Cardboard, Enum.PartType.Block, 0, true)
		local definition = CardCatalog.get(cardId)
		assert(definition, "showcase card is missing from CardCatalog: " .. cardId)
		addCardPlaque(showcase, definition, Vector3.new(x, 4.6, z - 4))
		local model = CreatureBuilder.build(cardId, showcase, Vector3.zero)
		model.Name = "Showcase_" .. cardId
		model:ScaleTo(0.48)
		model:PivotTo(CFrame.lookAt(Vector3.new(x, 2.1, z), Vector3.new(x, 2.1, z + 1)))
	end

	-- The battle board uses four plainly marked, connected zones.
	addPart(arena, "ArenaInkMat", Vector3.new(84, 2, 84), Vector3.new(0, -1, 0), COLORS.ink, Enum.Material.Slate, nil, 0, true)
	addPart(arena, "ArenaPaper", Vector3.new(80, 0.35, 80), Vector3.new(0, 0.18, 0), COLORS.paper, Enum.Material.Cardboard, nil, 0, true)
	local zoneColors = {
		Color3.fromRGB(193, 216, 207),
		Color3.fromRGB(235, 188, 150),
		Color3.fromRGB(183, 195, 221),
		Color3.fromRGB(226, 211, 169),
	}
	local zones = {}
	local zoneData = {
		{ name = "west", x = -18, z = 0 },
		{ name = "east", x = 18, z = 0 },
		{ name = "north", x = 0, z = -18 },
		{ name = "south", x = 0, z = 18 },
	}
	for indexValue, data in ipairs(zoneData) do
		zones[data.name] = addPart(arena, "ArenaZone_" .. data.name, Vector3.new(19, 0.18, 34), Vector3.new(data.x, 0.48, data.z), zoneColors[indexValue], Enum.Material.Cardboard, Enum.PartType.Block, 0, false)
	end
	for i = 1, 4 do
		local x = (i % 2 == 0) and 40 or -40
		local z = (i <= 2) and -40 or 40
		addPart(arena, "RegistrationMark" .. i, Vector3.new(4.2, 0.25, 4.2), Vector3.new(x, 0.55, z), COLORS.coral, Enum.Material.Neon, Enum.PartType.Block, 0.1, false)
	end
	addPart(arena, "BoardRuleNorth", Vector3.new(78, 0.14, 0.42), Vector3.new(0, 0.64, -39), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, false)
	addPart(arena, "BoardRuleSouth", Vector3.new(78, 0.14, 0.42), Vector3.new(0, 0.64, 39), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, false)
	addPart(arena, "BoardRuleWest", Vector3.new(0.42, 0.14, 78), Vector3.new(-39, 0.64, 0), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, false)
	addPart(arena, "BoardRuleEast", Vector3.new(0.42, 0.14, 78), Vector3.new(39, 0.64, 0), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, false)
	addPart(arena, "LaneRuleVertical", Vector3.new(0.24, 0.12, 64), Vector3.new(0, 0.65, 0), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, false)
	addPart(arena, "LaneRuleHorizontal", Vector3.new(64, 0.12, 0.24), Vector3.new(0, 0.65, 0), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, false)
	addPart(arena, "BossSealOuter", Vector3.new(20, 0.08, 20), Vector3.new(0, 0.46, -13), COLORS.ink, Enum.Material.Slate, Enum.PartType.Cylinder, 0, false)
	addPart(arena, "BossSealMiddle", Vector3.new(16, 0.08, 16), Vector3.new(0, 0.54, -13), COLORS.coral, Enum.Material.Cardboard, Enum.PartType.Cylinder, 0, false)
	addPart(arena, "BossSealInner", Vector3.new(12, 0.08, 12), Vector3.new(0, 0.62, -13), COLORS.cream, Enum.Material.Cardboard, Enum.PartType.Cylinder, 0, false)
	addPart(arena, "BossSeal", Vector3.new(8, 0.08, 8), Vector3.new(0, 0.7, -13), COLORS.teal, Enum.Material.Neon, Enum.PartType.Cylinder, 0.14, false)
	addPart(arena, "EntrySeal", Vector3.new(8, 0.25, 8), Vector3.new(0, 0.48, 27), COLORS.teal, Enum.Material.Neon, Enum.PartType.Cylinder, 0.32, false)
	local archiveSpines = {
		{ x = -34, width = 13, height = 17, color = COLORS.ink },
		{ x = -17, width = 15, height = 21, color = COLORS.blue },
		{ x = 0, width = 14, height = 18, color = Color3.fromRGB(121, 83, 92) },
		{ x = 17, width = 15, height = 23, color = Color3.fromRGB(61, 95, 92) },
		{ x = 34, width = 13, height = 16, color = COLORS.ink },
	}
	for indexValue, spine in ipairs(archiveSpines) do
		addPart(arena, "LostAtlasSpine_" .. indexValue, Vector3.new(spine.width, spine.height, 1.6), Vector3.new(spine.x, spine.height / 2, -43), spine.color, Enum.Material.Cardboard, Enum.PartType.Block, 0, true)
		addPart(arena, "LostAtlasFoil_" .. indexValue, Vector3.new(0.24, spine.height * 0.72, 0.1), Vector3.new(spine.x, spine.height * 0.57, -42.16), indexValue % 2 == 0 and COLORS.teal or COLORS.coral, Enum.Material.Neon, Enum.PartType.Block, 0.1, false)
	end
	for indexValue, z in ipairs({ 0 }) do
		local heights = { 18 }
		local height = heights[indexValue]
		addPart(arena, "WestAtlasSpine_" .. indexValue, Vector3.new(1.6, height, 12), Vector3.new(-43, height / 2, z), indexValue % 2 == 0 and COLORS.blue or COLORS.ink, Enum.Material.Cardboard, Enum.PartType.Block, 0, true)
		addPart(arena, "EastAtlasSpine_" .. indexValue, Vector3.new(1.6, height, 12), Vector3.new(43, height / 2, z), indexValue % 2 == 0 and Color3.fromRGB(61, 95, 92) or Color3.fromRGB(121, 83, 92), Enum.Material.Cardboard, Enum.PartType.Block, 0, true)
	end
	addPart(arena, "RedactorArchLeft", Vector3.new(2.4, 19, 2), Vector3.new(-15, 9.5, -40), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, true)
	addPart(arena, "RedactorArchRight", Vector3.new(2.4, 19, 2), Vector3.new(15, 9.5, -40), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, true)
	addPart(arena, "RedactorArchCrown", Vector3.new(32, 2.4, 2), Vector3.new(0, 20, -40), COLORS.coral, Enum.Material.Cardboard, Enum.PartType.Block, 0, true)
	addPart(arena, "ArchiveSpineRule", Vector3.new(78, 0.45, 0.9), Vector3.new(0, 24, -43), COLORS.teal, Enum.Material.Neon, Enum.PartType.Block, 0.08, false)
	for i = 1, 4 do
		local x = (i % 2 == 0) and 43 or -43
		local z = (i <= 2) and -18 or 18
		addPart(arena, "ArenaSpine" .. i, Vector3.new(1.1, 11, 1.1), Vector3.new(x, 5.1, z), COLORS.ink, Enum.Material.Slate, Enum.PartType.Block, 0, true)
		addPart(arena, "ArenaLamp" .. i, Vector3.new(1.8, 0.35, 1.8), Vector3.new(x, 10.8, z), i % 2 == 0 and COLORS.teal or COLORS.coral, Enum.Material.Neon, Enum.PartType.Ball, 0.1, false)
	end
	local boss = CreatureBuilder.buildBoss(arena, Vector3.new(config.Arena.BossSpawn.X, config.Arena.BossSpawn.Y, config.Arena.BossSpawn.Z))
	boss.Name = "TheRedactor"
	local warning = addPart(telegraphs, "WarningPlate", Vector3.new(1, 0.2, 1), Vector3.new(0, 0.7, 0), COLORS.coral, Enum.Material.Neon, Enum.PartType.Block, 0.2, false)
	warning.Transparency = 1
	local warningText = Instance.new("BillboardGui")
	warningText.Name = "Caption"
	warningText.Size = UDim2.fromOffset(280, 70)
	warningText.StudsOffset = Vector3.new(0, 5, 0)
	warningText.AlwaysOnTop = true
	warningText.Enabled = false
	warningText.Parent = warning
	local caption = Instance.new("TextLabel")
	caption.Name = "Text"
	caption.BackgroundColor3 = COLORS.ink
	caption.BackgroundTransparency = 0.15
	caption.Size = UDim2.fromScale(1, 1)
	caption.Font = Enum.Font.GothamBold
	caption.TextColor3 = COLORS.cream
	caption.TextScaled = true
	caption.Text = ""
	caption.Parent = warningText

	local world = {
		Root = root,
		Index = index,
		Arena = arena,
		Portal = portal,
		Prompt = prompt,
		SpawnLocation = spawn,
		Zones = zones,
		BossModel = boss,
		BossHealthLabel = nil,
		Warning = warning,
		WarningCaption = caption,
		Summons = summons,
		ArenaBounds = { Min = config.Arena.Min, Max = config.Arena.Max },
	}
	function world.showTelegraph(zoneNames, text)
		for _, zoneName in ipairs(zoneNames) do
			local zone = zones[zoneName]
			if zone then
				zone.Color = COLORS.coral
				zone.Material = Enum.Material.Neon
				zone.Transparency = 0.08
			end
		end
		warning.CFrame = CFrame.new(0, 0.9, 0)
		warning.Size = Vector3.new(18, 0.18, 2.2)
		warning.Transparency = 0.2
		caption.Text = text
		warningText.Enabled = true
	end
	function world.clearTelegraph()
		for _, data in ipairs(zoneData) do
			local zone = zones[data.name]
			zone.Color = COLORS.cream
			zone.Material = Enum.Material.Cardboard
			zone.Transparency = 0
		end
		warning.Transparency = 1
		warningText.Enabled = false
	end
	function world.createArrival(position, color, label)
		local marker = addPart(telegraphs, "Arrival_" .. label, Vector3.new(5, 0.2, 5), position - Vector3.new(0, 2.2, 0), color, Enum.Material.Neon, Enum.PartType.Cylinder, 0.35, false)
		task.delay(0.75, function()
			if marker.Parent then marker:Destroy() end
		end)
	end
	function world.teleportToIndex(player)
		local character = player.Character
		if character then
			character:PivotTo(CFrame.new(0, 4, 101))
		end
	end
	local staticPartCount = 0
	for _, item in ipairs(root:GetDescendants()) do
		if item:IsA("BasePart") then staticPartCount += 1 end
	end
	assert(staticPartCount <= 180, string.format("Index and arena use %d parts, above the 180-part slice budget", staticPartCount))
	root:SetAttribute("StaticWorldPartCount", staticPartCount)
	world.StaticPartCount = staticPartCount
	return world
end

return table.freeze(WorldBuilder)
