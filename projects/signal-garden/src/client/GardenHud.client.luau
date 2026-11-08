local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("GardenConfig"))
local player = Players.LocalPlayer
local stateRemote = ReplicatedStorage:WaitForChild(Config.StateRemoteName) :: RemoteEvent
local requestRemote = ReplicatedStorage:WaitForChild(Config.RequestRemoteName) :: RemoteEvent

local screen = Instance.new("ScreenGui")
screen.Name = "SignalGardenFieldNotes"
screen.ResetOnSpawn = false
screen.DisplayOrder = 20
screen.Parent = player:WaitForChild("PlayerGui")

local panel = Instance.new("Frame")
panel.Name = "FieldNotePanel"
panel.AnchorPoint = Vector2.new(0, 0)
panel.Position = UDim2.new(0, 18, 0, 18)
panel.Size = UDim2.new(1, -36, 0, 118)
panel.BackgroundColor3 = Color3.fromRGB(8, 21, 21)
panel.BackgroundTransparency = 0.12
panel.BorderSizePixel = 0
panel.Parent = screen

local sizeConstraint = Instance.new("UISizeConstraint")
sizeConstraint.MaxSize = Vector2.new(380, 118)
sizeConstraint.MinSize = Vector2.new(240, 118)
sizeConstraint.Parent = panel

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 9)
corner.Parent = panel

local accent = Instance.new("Frame")
accent.Name = "SignalEdge"
accent.Size = UDim2.new(0, 3, 1, -24)
accent.Position = UDim2.new(0, 0, 0, 12)
accent.BackgroundColor3 = Color3.fromRGB(94, 237, 181)
accent.BorderSizePixel = 0
accent.Parent = panel

local title = Instance.new("TextLabel")
title.Name = "Title"
title.Position = UDim2.new(0, 17, 0, 12)
title.Size = UDim2.new(1, -30, 0, 17)
title.BackgroundTransparency = 1
title.Font = Enum.Font.GothamMedium
title.Text = "FIELD NOTES   /   SIGNAL GARDEN"
title.TextColor3 = Color3.fromRGB(130, 207, 180)
title.TextSize = 10
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = panel

local objective = Instance.new("TextLabel")
objective.Name = "Objective"
objective.Position = UDim2.new(0, 17, 0, 35)
objective.Size = UDim2.new(1, -30, 0, 26)
objective.BackgroundTransparency = 1
objective.Font = Enum.Font.GothamSemibold
objective.Text = "Find three Echoes"
objective.TextColor3 = Color3.fromRGB(238, 246, 235)
objective.TextSize = 15
objective.TextWrapped = true
objective.TextXAlignment = Enum.TextXAlignment.Left
objective.Parent = panel

local status = Instance.new("TextLabel")
status.Name = "SharedStatus"
status.Position = UDim2.new(0, 17, 0, 65)
status.Size = UDim2.new(1, -30, 0, 18)
status.BackgroundTransparency = 1
status.Font = Enum.Font.Gotham
status.Text = "Archive charge  0 / 3"
status.TextColor3 = Color3.fromRGB(179, 198, 188)
status.TextSize = 12
status.TextXAlignment = Enum.TextXAlignment.Left
status.Parent = panel

local message = Instance.new("TextLabel")
message.Name = "FieldMessage"
message.Position = UDim2.new(0, 17, 0, 88)
message.Size = UDim2.new(1, -30, 0, 18)
message.BackgroundTransparency = 1
message.Font = Enum.Font.Gotham
message.Text = "Use the prompt shown when you approach a node."
message.TextColor3 = Color3.fromRGB(137, 167, 153)
message.TextSize = 10
message.TextTruncate = Enum.TextTruncate.AtEnd
message.TextXAlignment = Enum.TextXAlignment.Left
message.Parent = panel

local function applyState(snapshot, note)
	if typeof(snapshot) ~= "table" then return end
	if snapshot.phase == "gather" then
		objective.Text = string.format("Gather Echoes  ·  %d carried", snapshot.playerEchoes or 0)
	elseif snapshot.phase == "choose" then
		objective.Text = "Choose Moss or Bloom"
	elseif snapshot.phase == "relay" then
		objective.Text = string.format("Prime both plates  ·  %ds", snapshot.secondsRemaining or 0)
	elseif snapshot.phase == "restored" then
		objective.Text = "Habitat restored  ·  explore the glow"
	end
	status.Text = string.format("Archive charge  %d / %d    ·    Restorations %d", snapshot.deposits or 0, snapshot.requiredDeposits or 3, snapshot.completedRuns or 0)
	if snapshot.route then
		message.Text = string.format("%s route  ·  %s plate %s", snapshot.route, snapshot.firstPlateActive and "first" or "awaiting", snapshot.secondPlateActive and "second awake" or "pending")
	elseif note then
		message.Text = tostring(note)
	end
end

stateRemote.OnClientEvent:Connect(function(payload)
	if typeof(payload) ~= "table" or payload.kind ~= "state" then return end
	applyState(payload.state, payload.message)
end)

requestRemote:FireServer()
player.CharacterAdded:Connect(function()
	task.defer(function() requestRemote:FireServer() end)
end)
