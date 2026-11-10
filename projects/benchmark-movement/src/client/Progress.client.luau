local Players = game:GetService("Players")
local player = Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "MovementBenchmarkHud"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")
local label = Instance.new("TextLabel")
label.AnchorPoint = Vector2.new(0.5, 0)
label.Position = UDim2.fromScale(0.5, 0.04)
label.Size = UDim2.new(0.8, 0, 0, 44)
label.BackgroundColor3 = Color3.fromRGB(15, 21, 32)
label.BackgroundTransparency = 0.15
label.TextColor3 = Color3.fromRGB(238, 243, 247)
label.Font = Enum.Font.GothamBold
label.TextScaled = true
label.Parent = gui
local function update()
	if player:GetAttribute("ParkourComplete") then
		label.Text = "ROUTE COMPLETE — REPLAY BY RETURNING TO START"
	else
		label.Text = string.format("PARKOUR  ·  CHECKPOINT %d / 3", player:GetAttribute("ParkourCheckpoint") or 0)
	end
end
player:GetAttributeChangedSignal("ParkourCheckpoint"):Connect(update)
player:GetAttributeChangedSignal("ParkourComplete"):Connect(update)
update()
