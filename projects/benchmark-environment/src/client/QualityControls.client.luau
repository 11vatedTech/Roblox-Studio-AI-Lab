local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Rules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("EnvironmentRules"))
local player = Players.LocalPlayer
local world = workspace:WaitForChild("EnvironmentBenchmark")
local gui = Instance.new("ScreenGui")
gui.Name = "EnvironmentQualityHud"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")
local panel = Instance.new("Frame")
panel.Size = UDim2.new(0.92, 0, 0, 54)
panel.Position = UDim2.new(0.04, 0, 0.04, 0)
panel.BackgroundColor3 = Color3.fromRGB(15, 21, 32)
panel.BackgroundTransparency = 0.12
panel.Parent = gui
local layout = Instance.new("UIListLayout")
layout.FillDirection = Enum.FillDirection.Horizontal
layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
layout.VerticalAlignment = Enum.VerticalAlignment.Center
layout.Padding = UDim.new(0, 8)
layout.Parent = panel
local label = Instance.new("TextLabel")
label.Size = UDim2.new(0.34, 0, 0.82, 0)
label.BackgroundTransparency = 1
label.TextColor3 = Color3.fromRGB(238, 243, 247)
label.Font = Enum.Font.GothamBold
label.TextScaled = true
label.Text = "QUALITY TIER"
label.Parent = panel

local currentTier = "low"
local function applyTier(tier)
	local profile = Rules.profile(tier)
	if not profile then return end
	currentTier = tier
	local shown = 0
	local details = world:FindFirstChild("TieredDetails")
	if details then
		for _, item in ipairs(details:GetDescendants()) do
			if item:IsA("BasePart") then
				local requiredTier = item:GetAttribute("QualityTier")
				local visible = tier == "high" or (tier == "medium" and requiredTier == "medium")
				item.LocalTransparencyModifier = visible and 0 or 1
				if visible then shown += 1 end
				local light = item:FindFirstChild("HighTierLight")
				if light and light:IsA("PointLight") then light.Enabled = tier == "high" end
			end
		end
	end
	label.Text = string.format("%s TIER  ·  %d / %d DETAILS", string.upper(tier), shown, profile.decorativePartCap)
end
for _, tier in ipairs({ "low", "medium", "high" }) do
	local button = Instance.new("TextButton")
	button.Name = tier .. "Tier"
	button.Size = UDim2.new(0.18, 0, 0.82, 0)
	button.BackgroundColor3 = Color3.fromRGB(46, 86, 110)
	button.TextColor3 = Color3.fromRGB(245, 248, 250)
	button.Font = Enum.Font.GothamBold
	button.TextScaled = true
	button.Text = string.upper(tier)
	button.Parent = panel
	button.Activated:Connect(function() applyTier(tier) end)
end
applyTier(currentTier)
