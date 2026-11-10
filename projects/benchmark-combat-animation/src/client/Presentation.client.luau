local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local presentation = ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("AttackPresentation")
local dummy = workspace:WaitForChild("CombatBenchmark"):WaitForChild("CombatTrainingDummy")
local shoulder = dummy:WaitForChild("Core"):WaitForChild("TrainingShoulder")

local activeUntil = 0
local lastMessage = ""
local label = Instance.new("ScreenGui")
label.Name = "CombatBenchmarkHud"
label.ResetOnSpawn = false
label.Parent = player:WaitForChild("PlayerGui")
local text = Instance.new("TextLabel")
text.Name = "Feedback"
text.AnchorPoint = Vector2.new(0.5, 0)
text.Position = UDim2.fromScale(0.5, 0.08)
text.Size = UDim2.fromOffset(360, 48)
text.BackgroundColor3 = Color3.fromRGB(15, 21, 32)
text.BackgroundTransparency = 0.15
text.TextColor3 = Color3.fromRGB(238, 243, 247)
text.Font = Enum.Font.GothamBold
text.TextScaled = true
text.Text = "E / X: test a server-validated strike"
text.Parent = label

presentation.OnClientEvent:Connect(function(message, reason)
	if message == "swing" then
		activeUntil = os.clock() + 0.72
		lastMessage = "WINDUP  →  HIT WINDOW  →  RECOVERY"
	elseif message == "miss" then
		lastMessage = reason == "out_of_range" and "OUT OF RANGE — MOVE CLOSER" or "NO HIT — TRY AGAIN"
	end
	text.Text = lastMessage
end)

RunService.PreSimulation:Connect(function()
	local remaining = activeUntil - os.clock()
	if remaining > 0 then
		local progress = 1 - remaining / 0.72
		local swing = math.sin(math.clamp(progress, 0, 1) * math.pi)
		shoulder.Transform = CFrame.Angles(-0.8 * swing, 0, 1.15 * swing)
	else
		shoulder.Transform = CFrame.identity
	end
end)
