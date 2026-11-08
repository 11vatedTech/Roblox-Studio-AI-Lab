local CreatureBuilder = {}

local INK = Color3.fromRGB(31, 31, 45)
local CREAM = Color3.fromRGB(247, 223, 174)
local TEAL = Color3.fromRGB(65, 197, 181)

local function piece(model, name, size, offset, color, shape, material, transparency, className)
	local part = Instance.new(className or "Part")
	part.Name = name
	part.Size = size
	part.CFrame = CFrame.new(offset)
	part.Color = color
	part.Material = material or Enum.Material.SmoothPlastic
	part.Transparency = transparency or 0
	part.Anchored = true
	part.CanCollide = false
	part.CanTouch = false
	part.CanQuery = false
	part.CastShadow = false
	if shape then
		part.Shape = shape
	end
	part.Parent = model
	return part
end

local function makeModel(parent, name, cardId, position)
	local model = Instance.new("Model")
	model.Name = name
	model:SetAttribute("CardId", cardId)
	local root = piece(model, "Root", Vector3.new(1, 1, 1), Vector3.zero, INK)
	root.Transparency = 1
	model.PrimaryPart = root
	model.Parent = parent
	model:PivotTo(CFrame.new(position))
	return model
end

function CreatureBuilder.build(cardId, parent, position)
	assert(type(cardId) == "string" and typeof(parent) == "Instance", "invalid creature build arguments")
	position = position or Vector3.zero
	local model

	if cardId == "girdle_9" then
		model = makeModel(parent, "Girdle-9 · Door-Knight", cardId, position)
		piece(model, "Chest plate", Vector3.new(2.8, 2.5, 1.6), Vector3.new(0, 1.3, 0), Color3.fromRGB(88, 131, 147), Enum.PartType.Block, Enum.Material.Metal)
		piece(model, "Helmet", Vector3.new(1.9, 1.2, 1.5), Vector3.new(0, 3.2, 0), CREAM, Enum.PartType.Block, Enum.Material.Metal)
		piece(model, "Visor", Vector3.new(1.2, 0.25, 0.15), Vector3.new(0, 3.25, -0.8), TEAL, Enum.PartType.Block, Enum.Material.Neon)
		piece(model, "Left shoulder", Vector3.new(1.3, 1.4, 1.4), Vector3.new(-2, 2, 0), INK, Enum.PartType.Block, Enum.Material.Metal)
		piece(model, "Right shoulder", Vector3.new(1.3, 1.4, 1.4), Vector3.new(2, 2, 0), INK, Enum.PartType.Block, Enum.Material.Metal)
		piece(model, "Shield", Vector3.new(3.6, 3.2, 0.45), Vector3.new(3.2, 1.2, -0.5), Color3.fromRGB(222, 117, 79), Enum.PartType.Block, Enum.Material.Metal)
		piece(model, "Left boot", Vector3.new(0.9, 1.5, 1.1), Vector3.new(-0.7, -0.7, 0), CREAM, Enum.PartType.Block, Enum.Material.Metal)
		piece(model, "Right boot", Vector3.new(0.9, 1.5, 1.1), Vector3.new(0.7, -0.7, 0), CREAM, Enum.PartType.Block, Enum.Material.Metal)
		piece(model, "Door seam", Vector3.new(0.14, 2, 0.12), Vector3.new(0, 1.3, -0.84), Color3.fromRGB(219, 130, 92), Enum.PartType.Block, Enum.Material.Neon)
		piece(model, "Shield hinge upper", Vector3.new(0.46, 0.46, 0.32), Vector3.new(3.2, 2.2, -0.78), CREAM, Enum.PartType.Ball, Enum.Material.Metal)
		piece(model, "Shield hinge lower", Vector3.new(0.46, 0.46, 0.32), Vector3.new(3.2, 0.35, -0.78), CREAM, Enum.PartType.Ball, Enum.Material.Metal)
		piece(model, "Shield seal", Vector3.new(1.15, 1.15, 0.16), Vector3.new(3.2, 1.25, -0.78), TEAL, Enum.PartType.Ball, Enum.Material.Neon)
		piece(model, "Left shoulder rivet", Vector3.new(0.34, 0.34, 0.18), Vector3.new(-2, 2.15, -0.76), Color3.fromRGB(229, 171, 112), Enum.PartType.Ball, Enum.Material.Metal)
		piece(model, "Right shoulder rivet", Vector3.new(0.34, 0.34, 0.18), Vector3.new(2, 2.15, -0.76), Color3.fromRGB(229, 171, 112), Enum.PartType.Ball, Enum.Material.Metal)
		piece(model, "Chest latch", Vector3.new(0.72, 0.42, 0.14), Vector3.new(0, 0.35, -0.84), CREAM, Enum.PartType.Block, Enum.Material.Metal)
	elseif cardId == "nib_and_nuzzle" then
		model = makeModel(parent, "Nib & Nuzzle", cardId, position)
		piece(model, "Nib body", Vector3.new(1.7, 1.6, 1.5), Vector3.new(-1.1, 0.3, 0), Color3.fromRGB(243, 145, 93), Enum.PartType.Ball)
		piece(model, "Nib ears", Vector3.new(0.45, 1.2, 0.45), Vector3.new(-1.6, 1.5, 0), INK, Enum.PartType.Ball)
		piece(model, "Nib eye", Vector3.new(0.22, 0.22, 0.14), Vector3.new(-0.7, 0.5, -0.7), INK, Enum.PartType.Ball)
		piece(model, "Nuzzle body", Vector3.new(1.9, 1.7, 1.6), Vector3.new(1.2, 0.2, 0.1), Color3.fromRGB(240, 210, 143), Enum.PartType.Ball)
		piece(model, "Nuzzle ears", Vector3.new(0.5, 1.3, 0.5), Vector3.new(1.8, 1.4, 0.1), TEAL, Enum.PartType.Ball)
		piece(model, "Nuzzle eye", Vector3.new(0.22, 0.22, 0.14), Vector3.new(1.7, 0.45, -0.72), INK, Enum.PartType.Ball)
		piece(model, "Ribbon", Vector3.new(0.35, 0.35, 2.5), Vector3.new(0, -0.3, 0.7), Color3.fromRGB(179, 80, 111), Enum.PartType.Block)
		piece(model, "Nib nose", Vector3.new(0.34, 0.25, 0.22), Vector3.new(-1.1, 0.25, -0.78), Color3.fromRGB(112, 58, 73), Enum.PartType.Ball)
		piece(model, "Nuzzle nose", Vector3.new(0.34, 0.25, 0.22), Vector3.new(1.18, 0.18, -0.82), Color3.fromRGB(112, 58, 73), Enum.PartType.Ball)
		piece(model, "Nib tail", Vector3.new(0.62, 0.62, 0.62), Vector3.new(-2.05, -0.1, 1.02), CREAM, Enum.PartType.Ball)
		piece(model, "Nuzzle tail", Vector3.new(0.62, 0.62, 0.62), Vector3.new(2.18, -0.18, 1.12), TEAL, Enum.PartType.Ball)
		piece(model, "Nib front paw", Vector3.new(0.42, 0.36, 0.5), Vector3.new(-1.55, -0.48, -0.35), CREAM, Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Nib back paw", Vector3.new(0.42, 0.36, 0.5), Vector3.new(-0.68, -0.48, 0.4), CREAM, Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Nuzzle front paw", Vector3.new(0.46, 0.38, 0.52), Vector3.new(0.72, -0.5, -0.32), Color3.fromRGB(219, 130, 92), Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Nuzzle back paw", Vector3.new(0.46, 0.38, 0.52), Vector3.new(1.67, -0.5, 0.45), Color3.fromRGB(219, 130, 92), Enum.PartType.Ball, Enum.Material.Fabric)
	elseif cardId == "morrowbell" then
		model = makeModel(parent, "Morrowbell", cardId, position)
		piece(model, "Bell body", Vector3.new(2.6, 2.5, 2.4), Vector3.new(0, 1.2, 0), Color3.fromRGB(158, 203, 201), Enum.PartType.Ball, Enum.Material.Glass, 0.28)
		piece(model, "Bell crown", Vector3.new(1.5, 0.65, 1.5), Vector3.new(0, 2.45, 0), CREAM, Enum.PartType.Cylinder, Enum.Material.Metal)
		piece(model, "Bell clapper", Vector3.new(0.55, 0.8, 0.55), Vector3.new(0, 0.1, -0.1), Color3.fromRGB(211, 164, 114), Enum.PartType.Ball, Enum.Material.Neon, 0.15)
		piece(model, "Floating veil left", Vector3.new(0.45, 2, 0.55), Vector3.new(-1, -0.5, 0.35), Color3.fromRGB(127, 175, 184), Enum.PartType.Ball, Enum.Material.Glass, 0.32)
		piece(model, "Floating veil right", Vector3.new(0.45, 2, 0.55), Vector3.new(1, -0.5, 0.35), Color3.fromRGB(127, 175, 184), Enum.PartType.Ball, Enum.Material.Glass, 0.32)
		piece(model, "Misprint eye", Vector3.new(0.24, 0.24, 0.15), Vector3.new(0.42, 1.3, -1.03), INK, Enum.PartType.Ball)
		piece(model, "Echo halo", Vector3.new(3.4, 0.16, 3.4), Vector3.new(0, 3.3, 0.05), Color3.fromRGB(229, 171, 112), Enum.PartType.Cylinder, Enum.Material.Metal)
		piece(model, "Second misprint eye", Vector3.new(0.24, 0.24, 0.15), Vector3.new(-0.42, 1.3, -1.03), INK, Enum.PartType.Ball)
		piece(model, "Bell smile", Vector3.new(0.6, 0.12, 0.12), Vector3.new(0, 0.86, -1.05), Color3.fromRGB(83, 127, 138), Enum.PartType.Block, Enum.Material.Neon)
		piece(model, "Bell rune", Vector3.new(0.34, 0.72, 0.12), Vector3.new(0, 0.18, -1.14), CREAM, Enum.PartType.Block, Enum.Material.Neon)
		piece(model, "Wisp mote left", Vector3.new(0.5, 0.5, 0.5), Vector3.new(-1.6, 2.6, 0.2), TEAL, Enum.PartType.Ball, Enum.Material.Neon, 0.18)
		piece(model, "Wisp mote right", Vector3.new(0.38, 0.38, 0.38), Vector3.new(1.55, 2.1, 0.48), Color3.fromRGB(229, 171, 112), Enum.PartType.Ball, Enum.Material.Neon, 0.12)
	elseif cardId == "foldwyn_pagewing" then
		model = makeModel(parent, "Foldwyn · Pagewing", cardId, position)
		piece(model, "Folded body", Vector3.new(1.7, 2.7, 1.1), Vector3.new(0, 0.8, 0), Color3.fromRGB(240, 224, 185), Enum.PartType.Block, Enum.Material.Cardboard)
		piece(model, "Left page wing", Vector3.new(2.7, 0.3, 2.8), Vector3.new(-1.7, 1.6, -0.1), Color3.fromRGB(219, 130, 92), nil, Enum.Material.Cardboard, nil, "WedgePart")
		piece(model, "Right page wing", Vector3.new(2.7, 0.3, 2.8), Vector3.new(1.7, 1.6, -0.1), Color3.fromRGB(96, 174, 166), nil, Enum.Material.Cardboard, nil, "WedgePart")
		piece(model, "Page fold", Vector3.new(0.18, 3, 0.18), Vector3.new(0, 1, -0.6), INK, Enum.PartType.Block)
		piece(model, "Eye", Vector3.new(0.2, 0.2, 0.12), Vector3.new(0, 1.3, -0.62), INK, Enum.PartType.Ball)
		piece(model, "Left printed fold", Vector3.new(1.75, 0.12, 0.16), Vector3.new(-1.65, 1.55, -1.38), CREAM, Enum.PartType.Block, Enum.Material.Neon, 0.12)
		piece(model, "Right printed fold", Vector3.new(1.75, 0.12, 0.16), Vector3.new(1.65, 1.55, -1.38), CREAM, Enum.PartType.Block, Enum.Material.Neon, 0.12)
		piece(model, "Left tail feather", Vector3.new(1.4, 0.28, 2.1), Vector3.new(-0.95, -0.8, 1.1), Color3.fromRGB(219, 130, 92), nil, Enum.Material.Cardboard, nil, "WedgePart")
		piece(model, "Right tail feather", Vector3.new(1.4, 0.28, 2.1), Vector3.new(0.95, -0.8, 1.1), Color3.fromRGB(96, 174, 166), nil, Enum.Material.Cardboard, nil, "WedgePart")
		piece(model, "Eye glint", Vector3.new(0.1, 0.1, 0.08), Vector3.new(0.06, 1.34, -0.72), TEAL, Enum.PartType.Ball, Enum.Material.Neon)
		piece(model, "Fold seal", Vector3.new(0.42, 0.42, 0.14), Vector3.new(0, 2.5, -0.42), Color3.fromRGB(219, 130, 92), Enum.PartType.Ball, Enum.Material.Neon)
	elseif cardId == "buttongrin" then
		model = makeModel(parent, "Buttongrin", cardId, position)
		piece(model, "Plush body", Vector3.new(3.1, 3.4, 2.6), Vector3.new(0, 0.8, 0), Color3.fromRGB(188, 118, 138), Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Left ear", Vector3.new(0.9, 1.4, 0.75), Vector3.new(-1.1, 2.6, 0.1), CREAM, Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Right ear", Vector3.new(0.9, 1.4, 0.75), Vector3.new(1.1, 2.6, 0.1), CREAM, Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Button eye left", Vector3.new(0.48, 0.48, 0.2), Vector3.new(-0.55, 1, -1.18), CREAM, Enum.PartType.Cylinder, Enum.Material.Metal)
		piece(model, "Button eye right", Vector3.new(0.48, 0.48, 0.2), Vector3.new(0.55, 1, -1.18), CREAM, Enum.PartType.Cylinder, Enum.Material.Metal)
		piece(model, "Stitch", Vector3.new(0.1, 0.95, 0.12), Vector3.new(0, -0.2, -1.24), INK, Enum.PartType.Block)
		piece(model, "Left arm", Vector3.new(0.9, 1.5, 1), Vector3.new(-1.8, 0.3, 0), Color3.fromRGB(188, 118, 138), Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Right arm", Vector3.new(0.9, 1.5, 1), Vector3.new(1.8, 0.3, 0), Color3.fromRGB(188, 118, 138), Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Left paw", Vector3.new(0.78, 0.5, 0.72), Vector3.new(-1.65, -0.8, -0.2), CREAM, Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Right paw", Vector3.new(0.78, 0.5, 0.72), Vector3.new(1.65, -0.8, -0.2), CREAM, Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Back button", Vector3.new(0.52, 0.52, 0.24), Vector3.new(0, 1, 1.34), Color3.fromRGB(229, 171, 112), Enum.PartType.Ball, Enum.Material.Metal)
		piece(model, "Bow left loop", Vector3.new(0.75, 0.5, 0.35), Vector3.new(-0.58, 3.1, -0.1), Color3.fromRGB(219, 130, 92), Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Bow right loop", Vector3.new(0.75, 0.5, 0.35), Vector3.new(0.58, 3.1, -0.1), Color3.fromRGB(219, 130, 92), Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Bow knot", Vector3.new(0.48, 0.48, 0.42), Vector3.new(0, 3.1, -0.28), CREAM, Enum.PartType.Ball, Enum.Material.Fabric)
		piece(model, "Belly patch", Vector3.new(1.35, 1.1, 0.18), Vector3.new(0, 0.25, -1.28), Color3.fromRGB(229, 171, 112), Enum.PartType.Ball, Enum.Material.Fabric)
	elseif cardId == "sableline" then
		model = makeModel(parent, "Sableline", cardId, position)
		piece(model, "Puppet torso", Vector3.new(1.1, 3.1, 0.8), Vector3.new(0, 0.9, 0), INK, Enum.PartType.Block, Enum.Material.SmoothPlastic)
		piece(model, "Puppet head", Vector3.new(1.6, 1.4, 1.2), Vector3.new(0, 2.9, 0), Color3.fromRGB(44, 42, 56), Enum.PartType.Ball)
		piece(model, "Left thread", Vector3.new(0.12, 3.5, 0.12), Vector3.new(-1.1, 2.3, 0), Color3.fromRGB(229, 171, 112), Enum.PartType.Block, Enum.Material.Neon)
		piece(model, "Right thread", Vector3.new(0.12, 3.5, 0.12), Vector3.new(1.1, 2.3, 0), Color3.fromRGB(229, 171, 112), Enum.PartType.Block, Enum.Material.Neon)
		piece(model, "Left arm", Vector3.new(0.35, 2.4, 0.35), Vector3.new(-0.9, 1.1, 0), Color3.fromRGB(103, 91, 130), Enum.PartType.Block)
		piece(model, "Right arm", Vector3.new(0.35, 2.4, 0.35), Vector3.new(0.9, 1.1, 0), Color3.fromRGB(103, 91, 130), Enum.PartType.Block)
		piece(model, "Mask eye", Vector3.new(0.23, 0.23, 0.12), Vector3.new(-0.3, 3, -0.57), Color3.fromRGB(232, 190, 116), Enum.PartType.Ball, Enum.Material.Neon)
		piece(model, "Right mask eye", Vector3.new(0.23, 0.23, 0.12), Vector3.new(0.3, 3, -0.57), Color3.fromRGB(232, 190, 116), Enum.PartType.Ball, Enum.Material.Neon)
		piece(model, "Mask smile", Vector3.new(0.52, 0.1, 0.1), Vector3.new(0, 2.62, -0.58), Color3.fromRGB(219, 130, 92), Enum.PartType.Block, Enum.Material.Neon)
		piece(model, "Left brow", Vector3.new(0.5, 0.12, 0.12), Vector3.new(-0.35, 3.32, -0.58), CREAM, Enum.PartType.Block)
		piece(model, "Right brow", Vector3.new(0.5, 0.12, 0.12), Vector3.new(0.35, 3.32, -0.58), CREAM, Enum.PartType.Block)
		piece(model, "Puppet left leg", Vector3.new(0.36, 1.5, 0.42), Vector3.new(-0.38, -1.45, 0), Color3.fromRGB(103, 91, 130), Enum.PartType.Block)
		piece(model, "Puppet right leg", Vector3.new(0.36, 1.5, 0.42), Vector3.new(0.38, -1.45, 0), Color3.fromRGB(103, 91, 130), Enum.PartType.Block)
		piece(model, "Puppet left shoe", Vector3.new(0.65, 0.32, 0.78), Vector3.new(-0.42, -2.22, -0.12), Color3.fromRGB(229, 171, 112), Enum.PartType.Block, Enum.Material.Leather)
		piece(model, "Puppet right shoe", Vector3.new(0.65, 0.32, 0.78), Vector3.new(0.42, -2.22, -0.12), Color3.fromRGB(229, 171, 112), Enum.PartType.Block, Enum.Material.Leather)
	else
		return nil, "unknown_card"
	end

	local partCount = 0
	for _, child in ipairs(model:GetDescendants()) do
		if child:IsA("BasePart") then partCount += 1 end
	end
	assert(partCount <= 16, string.format("%s exceeded its 16-part art budget", cardId))
	return model
end

function CreatureBuilder.buildBoss(parent, position)
	local model = makeModel(parent, "The Redactor", "the_redactor", position)
	piece(model, "Ink mantle", Vector3.new(6.5, 8, 4), Vector3.new(0, 1, 0), Color3.fromRGB(49, 37, 55), Enum.PartType.Block, Enum.Material.Slate)
	piece(model, "Mask", Vector3.new(3.6, 2.8, 1.1), Vector3.new(0, 4.2, -2), Color3.fromRGB(232, 207, 159), Enum.PartType.Block, Enum.Material.Cardboard)
	piece(model, "Red rule", Vector3.new(0.35, 5.8, 0.25), Vector3.new(0, 4.2, -2.6), Color3.fromRGB(190, 65, 76), Enum.PartType.Block, Enum.Material.Neon)
	piece(model, "Eraser crown", Vector3.new(5.7, 1.4, 1.3), Vector3.new(0, 8.1, 0), Color3.fromRGB(185, 76, 82), Enum.PartType.Block, Enum.Material.Metal)
	piece(model, "Left arm", Vector3.new(2.2, 5.6, 1.7), Vector3.new(-4.2, 0.5, 0), Color3.fromRGB(72, 51, 70), Enum.PartType.Block, Enum.Material.Slate)
	piece(model, "Right arm", Vector3.new(2.2, 5.6, 1.7), Vector3.new(4.2, 0.5, 0), Color3.fromRGB(72, 51, 70), Enum.PartType.Block, Enum.Material.Slate)
	piece(model, "Ink seal", Vector3.new(1, 1, 0.35), Vector3.new(0, 5.6, -2.8), TEAL, Enum.PartType.Ball, Enum.Material.Neon)
	piece(model, "Left crown nib", Vector3.new(1.5, 2, 1.4), Vector3.new(-2.2, 9.1, 0), Color3.fromRGB(219, 130, 92), nil, Enum.Material.Metal, nil, "WedgePart")
	piece(model, "Right crown nib", Vector3.new(1.5, 2, 1.4), Vector3.new(2.2, 9.1, 0), Color3.fromRGB(219, 130, 92), nil, Enum.Material.Metal, nil, "WedgePart")
	piece(model, "Left mask eye", Vector3.new(0.62, 0.42, 0.16), Vector3.new(-0.9, 4.65, -2.63), TEAL, Enum.PartType.Ball, Enum.Material.Neon)
	piece(model, "Right mask eye", Vector3.new(0.62, 0.42, 0.16), Vector3.new(0.9, 4.65, -2.63), TEAL, Enum.PartType.Ball, Enum.Material.Neon)
	piece(model, "Mask mouth", Vector3.new(1.25, 0.22, 0.15), Vector3.new(0, 3.45, -2.64), INK, Enum.PartType.Block, Enum.Material.Metal)
	piece(model, "Torn mantle left", Vector3.new(2.5, 3.4, 1.6), Vector3.new(-2.2, -3.1, 0.25), Color3.fromRGB(73, 56, 80), nil, Enum.Material.Slate, nil, "WedgePart")
	piece(model, "Torn mantle right", Vector3.new(2.5, 3.4, 1.6), Vector3.new(2.2, -3.1, 0.25), Color3.fromRGB(73, 56, 80), nil, Enum.Material.Slate, nil, "WedgePart")
	piece(model, "Floating lost page", Vector3.new(2.6, 3.8, 0.18), Vector3.new(-5.5, 7.4, 0.7), Color3.fromRGB(239, 219, 177), Enum.PartType.Block, Enum.Material.Cardboard)
	piece(model, "Ink mote left", Vector3.new(0.5, 0.5, 0.5), Vector3.new(-5.2, 4.2, 0.6), Color3.fromRGB(205, 88, 78), Enum.PartType.Ball, Enum.Material.Neon)
	piece(model, "Ink mote right", Vector3.new(0.38, 0.38, 0.38), Vector3.new(5.1, 6.4, 0.4), TEAL, Enum.PartType.Ball, Enum.Material.Neon)
	model:PivotTo(CFrame.new(position) * CFrame.Angles(0, math.pi, 0))
	local partCount = 0
	for _, child in ipairs(model:GetDescendants()) do
		if child:IsA("BasePart") then partCount += 1 end
	end
	assert(partCount <= 32, "The Redactor exceeded its 32-part art budget")
	return model
end

return table.freeze(CreatureBuilder)
