local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Rules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("CinematicRules"))
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local cues = {
	{ id = "title", duration = 1.2, eyebrow = "01 / ARRIVAL", heading = "THE QUIET BETWEEN", detail = "A PLACE REMEMBERS" },
	{ id = "location", duration = 1.0, eyebrow = "02 / FIELD NOTES", heading = "NORTH GLASS MARSH", detail = "FIELD LOCATION" },
	{ id = "objective", duration = 1.6, eyebrow = "03 / NEXT STEP", heading = "Find the signal before dusk.", detail = "OBJECTIVE" },
}

local screen = Instance.new("ScreenGui")
screen.Name = "CinematicFieldNotes"
screen.ResetOnSpawn = false
screen.IgnoreGuiInset = false
screen.DisplayOrder = 20
screen.Parent = playerGui

local panel = Instance.new("Frame")
panel.Name = "FieldNotesPanel"
panel.AnchorPoint = Vector2.new(0, 0)
panel.Position = UDim2.new(0.04, 0, 0.07, 0)
panel.Size = UDim2.new(0.92, 0, 0, 218)
panel.BackgroundColor3 = Color3.fromRGB(15, 25, 29)
panel.BackgroundTransparency = 0.14
panel.BorderSizePixel = 0
panel.Parent = screen

local panelSize = Instance.new("UISizeConstraint")
panelSize.MaxSize = Vector2.new(520, 218)
panelSize.Parent = panel

local panelCorner = Instance.new("UICorner")
panelCorner.CornerRadius = UDim.new(0, 10)
panelCorner.Parent = panel

local panelStroke = Instance.new("UIStroke")
panelStroke.Color = Color3.fromRGB(104, 151, 139)
panelStroke.Transparency = 0.58
panelStroke.Thickness = 1
panelStroke.Parent = panel

local padding = Instance.new("UIPadding")
padding.PaddingLeft = UDim.new(0, 18)
padding.PaddingRight = UDim.new(0, 18)
padding.PaddingTop = UDim.new(0, 14)
padding.Parent = panel

local eyebrow = Instance.new("TextLabel")
eyebrow.Name = "CueEyebrow"
eyebrow.BackgroundTransparency = 1
eyebrow.Position = UDim2.new(0, 0, 0, 0)
eyebrow.Size = UDim2.new(1, 0, 0, 18)
eyebrow.Font = Enum.Font.GothamMedium
eyebrow.TextColor3 = Color3.fromRGB(140, 207, 190)
eyebrow.TextSize = 12
eyebrow.TextXAlignment = Enum.TextXAlignment.Left
eyebrow.TextTruncate = Enum.TextTruncate.AtEnd
eyebrow.Parent = panel

local heading = Instance.new("TextLabel")
heading.Name = "CueHeading"
heading.BackgroundTransparency = 1
heading.Position = UDim2.new(0, 0, 0, 31)
heading.Size = UDim2.new(1, 0, 0, 70)
heading.Font = Enum.Font.GothamBold
heading.TextColor3 = Color3.fromRGB(243, 239, 226)
heading.TextSize = 26
heading.TextWrapped = true
heading.TextXAlignment = Enum.TextXAlignment.Left
heading.TextYAlignment = Enum.TextYAlignment.Top
heading.Parent = panel

local detail = Instance.new("TextLabel")
detail.Name = "CueDetail"
detail.BackgroundTransparency = 1
detail.Position = UDim2.new(0, 0, 0, 111)
detail.Size = UDim2.new(1, 0, 0, 22)
detail.Font = Enum.Font.GothamMedium
detail.TextColor3 = Color3.fromRGB(232, 185, 104)
detail.TextSize = 14
detail.TextWrapped = true
detail.TextXAlignment = Enum.TextXAlignment.Left
detail.Parent = panel

local function button(name, text, position, size, backgroundColor)
	local control = Instance.new("TextButton")
	control.Name = name
	control.Position = position
	control.Size = size
	control.BackgroundColor3 = backgroundColor
	control.BorderSizePixel = 0
	control.AutoButtonColor = true
	control.Font = Enum.Font.GothamBold
	control.Text = text
	control.TextColor3 = Color3.fromRGB(245, 246, 238)
	control.TextSize = 14
	control.TextWrapped = true
	control.Parent = panel

	local sizeConstraint = Instance.new("UISizeConstraint")
	sizeConstraint.MinSize = Vector2.new(44, 48)
	sizeConstraint.Parent = control

	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 6)
	corner.Parent = control
	return control
end

local skipButton = button(
	"Skip",
	"SKIP INTRO",
	UDim2.new(0, 0, 0, 151),
	UDim2.new(0.46, -4, 0, 48),
	Color3.fromRGB(48, 91, 87)
)
local motionButton = button(
	"ReducedMotion",
	"REDUCED MOTION: OFF",
	UDim2.new(0.54, 4, 0, 151),
	UDim2.new(0.46, -4, 0, 48),
	Color3.fromRGB(52, 65, 69)
)

local reducedMotion = false
local state = { index = 1, startedAt = os.clock() }
local renderedIndex = 0
local renderedComplete = nil
local fadeTweens = {}

local function render(animate, force)
	local cueIndex = math.min(state.index, #cues)
	if not force and renderedIndex == cueIndex and renderedComplete == state.complete then return end

	local cue = cues[cueIndex]
	eyebrow.Text = cue.eyebrow
	heading.Text = cue.heading
	detail.Text = cue.detail
	if cue.id == "objective" then
		heading.TextColor3 = Color3.fromRGB(244, 202, 126)
	else
		heading.TextColor3 = Color3.fromRGB(243, 239, 226)
	end
	for _, tween in ipairs(fadeTweens) do tween:Cancel() end
	table.clear(fadeTweens)
	if animate and not reducedMotion then
		local fade = TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
		for _, label in ipairs({ eyebrow, heading, detail }) do
			label.TextTransparency = 1
			local tween = TweenService:Create(label, fade, { TextTransparency = 0 })
			table.insert(fadeTweens, tween)
			tween:Play()
		end
	else
		eyebrow.TextTransparency = 0
		heading.TextTransparency = 0
		detail.TextTransparency = 0
	end
	renderedIndex = cueIndex
	renderedComplete = state.complete
end

local function advance(skipRequested)
	local nextState, reason = Rules.advance(state, cues, os.clock(), skipRequested, reducedMotion)
	if not nextState then error("Cinematic sequence rejected a state transition: " .. tostring(reason)) end
	state = nextState
	render(not skipRequested)
end

skipButton.Activated:Connect(function()
	advance(true)
end)

motionButton.Activated:Connect(function()
	reducedMotion = not reducedMotion
	motionButton.Text = reducedMotion and "REDUCED MOTION: ON" or "REDUCED MOTION: OFF"
	render(false, true)
end)

render(true)
local heartbeatConnection
heartbeatConnection = RunService.Heartbeat:Connect(function()
	if state.complete then
		heartbeatConnection:Disconnect()
		return
	end
	advance(false)
end)

script.Destroying:Connect(function()
	if heartbeatConnection then heartbeatConnection:Disconnect() end
	for _, tween in ipairs(fadeTweens) do tween:Cancel() end
	screen:Destroy()
end)
