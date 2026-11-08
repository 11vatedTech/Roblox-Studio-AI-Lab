local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CollectionService = game:GetService("CollectionService")
local Constants = require(ReplicatedStorage:WaitForChild("SignalConstants"))

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local collectRemote = ReplicatedStorage:WaitForChild(Constants.CollectRemoteName) :: RemoteEvent
local feedbackRemote = ReplicatedStorage:WaitForChild(Constants.FeedbackRemoteName) :: RemoteEvent

local screen = Instance.new("ScreenGui")
screen.Name = "LabSignalHud"
screen.ResetOnSpawn = false
screen.Parent = playerGui

local counter = Instance.new("TextLabel")
counter.Name = "SignalCounter"
counter.AnchorPoint = Vector2.new(1, 0)
counter.Position = UDim2.new(1, -24, 0, 24)
counter.Size = UDim2.fromOffset(210, 56)
counter.BackgroundColor3 = Color3.fromRGB(9, 24, 25)
counter.BackgroundTransparency = 0.08
counter.BorderSizePixel = 0
counter.Font = Enum.Font.GothamMedium
counter.Text = "SIGNALS  0"
counter.TextColor3 = Color3.fromRGB(223, 245, 236)
counter.TextSize = 18
counter.Parent = screen

local corner = Instance.new("UICorner")
corner.CornerRadius = UDim.new(0, 8)
corner.Parent = counter

local function updateCount()
	local leaderstats = player:FindFirstChild("leaderstats")
	local signals = leaderstats and leaderstats:FindFirstChild("Signals")
	if signals and signals:IsA("IntValue") then
		counter.Text = string.format("SIGNALS  %d", signals.Value)
	end
end

local function connectPrompt(instance: Instance)
	if not instance:IsA("BasePart") then
		return
	end
	local prompt = instance:FindFirstChildOfClass("ProximityPrompt")
	if not prompt or prompt:GetAttribute("LabClientConnected") == true then
		return
	end
	prompt:SetAttribute("LabClientConnected", true)
	prompt.Triggered:Connect(function()
		collectRemote:FireServer(instance)
	end)
end

local leaderstats = player:WaitForChild("leaderstats", 10)
if leaderstats then
	local signals = leaderstats:WaitForChild("Signals", 10)
	if signals then
		signals:GetPropertyChangedSignal("Value"):Connect(updateCount)
		updateCount()
	end
end

for _, instance in CollectionService:GetTagged(Constants.FragmentTag) do
	connectPrompt(instance)
end
CollectionService:GetInstanceAddedSignal(Constants.FragmentTag):Connect(connectPrompt)

local field = workspace:WaitForChild("LabSignalField", 10)
if not field then
	warn("[11vated Lab] Signal field was not created by the server")
end

feedbackRemote.OnClientEvent:Connect(function(message)
	if typeof(message) == "table" and message.kind == "signal_collected" and typeof(message.count) == "number" then
		counter.Text = string.format("SIGNALS  %d", message.count)
	end
end)
