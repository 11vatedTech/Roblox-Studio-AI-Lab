local Players = game:GetService("Players")
local player = Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "RelayBenchmarkHud"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel")
label.AnchorPoint = Vector2.new(0.5, 0)
label.Position = UDim2.fromScale(0.5, 0.05)
label.Size = UDim2.new(0.88, 0, 0, 52)
label.BackgroundColor3 = Color3.fromRGB(15, 21, 32)
label.BackgroundTransparency = 0.15
label.TextColor3 = Color3.fromRGB(238, 243, 247)
label.Font = Enum.Font.GothamBold
label.TextScaled = true
label.Text = "TWO PLAYERS · ONE RELAY EACH"
label.Parent = gui
local function update()
	label.Text = player:GetAttribute("RelayFeedback") or "TWO PLAYERS · ONE RELAY EACH"
end
player:GetAttributeChangedSignal("RelayFeedback"):Connect(update)
update()
