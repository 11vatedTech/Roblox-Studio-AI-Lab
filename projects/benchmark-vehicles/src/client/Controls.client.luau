local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local shared = ReplicatedStorage:WaitForChild("BenchmarkShared")
local control = shared:WaitForChild("VehicleControl")
local status = shared:WaitForChild("VehicleStatus")
local seat = workspace:WaitForChild("VehicleBenchmark"):WaitForChild("ServerOwnedCart"):WaitForChild("DriverSeat")

local controls = { throttle = 0, steer = 0 }
local pressed = { forward = false, reverse = false, left = false, right = false }
local gui = Instance.new("ScreenGui")
gui.Name = "VehicleBenchmarkHud"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")
local message = Instance.new("TextLabel")
message.AnchorPoint = Vector2.new(0.5, 1)
message.Position = UDim2.fromScale(0.5, 0.95)
message.Size = UDim2.new(0.86, 0, 0, 46)
message.BackgroundColor3 = Color3.fromRGB(15, 21, 32)
message.BackgroundTransparency = 0.15
message.TextColor3 = Color3.fromRGB(238, 243, 247)
message.Font = Enum.Font.GothamBold
message.TextScaled = true
message.Text = "Sit in the cart · W/S and A/D, gamepad stick, or touch controls"
message.Parent = gui

local buttons = {}
local function button(name, text, position, size)
	local value = Instance.new("TextButton")
	value.Name = name
	value.Text = text
	value.Position = position
	value.Size = size
	value.BackgroundColor3 = Color3.fromRGB(42, 68, 88)
	value.BackgroundTransparency = 0.15
	value.TextColor3 = Color3.fromRGB(245, 248, 250)
	value.Font = Enum.Font.GothamBold
	value.TextScaled = true
	value.Visible = false
	value.Parent = gui
	buttons[name] = value
	return value
end
local drive = button("Drive", "DRIVE", UDim2.new(1, -188, 1, -190), UDim2.fromOffset(86, 70))
local reverse = button("Reverse", "REV", UDim2.new(1, -188, 1, -108), UDim2.fromOffset(86, 70))
local left = button("Left", "◀", UDim2.new(1, -284, 1, -150), UDim2.fromOffset(86, 70))
local right = button("Right", "▶", UDim2.new(1, -92, 1, -150), UDim2.fromOffset(86, 70))

local function bindHold(buttonObject, key)
	buttonObject.InputBegan:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then pressed[key] = true end
	end)
	buttonObject.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.Touch or input.UserInputType == Enum.UserInputType.MouseButton1 then pressed[key] = false end
	end)
end
bindHold(drive, "forward")
bindHold(reverse, "reverse")
bindHold(left, "left")
bindHold(right, "right")

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.KeyCode == Enum.KeyCode.W or input.KeyCode == Enum.KeyCode.Up then pressed.forward = true end
	if input.KeyCode == Enum.KeyCode.S or input.KeyCode == Enum.KeyCode.Down then pressed.reverse = true end
	if input.KeyCode == Enum.KeyCode.A or input.KeyCode == Enum.KeyCode.Left then pressed.left = true end
	if input.KeyCode == Enum.KeyCode.D or input.KeyCode == Enum.KeyCode.Right then pressed.right = true end
end)
UserInputService.InputEnded:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.W or input.KeyCode == Enum.KeyCode.Up then pressed.forward = false end
	if input.KeyCode == Enum.KeyCode.S or input.KeyCode == Enum.KeyCode.Down then pressed.reverse = false end
	if input.KeyCode == Enum.KeyCode.A or input.KeyCode == Enum.KeyCode.Left then pressed.left = false end
	if input.KeyCode == Enum.KeyCode.D or input.KeyCode == Enum.KeyCode.Right then pressed.right = false end
end)
UserInputService.InputChanged:Connect(function(input)
	if input.KeyCode == Enum.KeyCode.Thumbstick1 then
		controls.throttle = -math.clamp(input.Position.Y, -1, 1)
		controls.steer = math.clamp(input.Position.X, -1, 1)
	end
end)

status.OnClientEvent:Connect(function(text) message.Text = tostring(text) end)
local sendAccumulator = 0
RunService.Heartbeat:Connect(function(dt)
	local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	local seated = humanoid ~= nil and seat.Occupant == humanoid
	for _, value in pairs(buttons) do value.Visible = seated and UserInputService.TouchEnabled end
	if not seated then
		controls.throttle = 0
		controls.steer = 0
		pressed.forward, pressed.reverse, pressed.left, pressed.right = false, false, false, false
		return
	end
	if not (UserInputService.GamepadEnabled and math.abs(controls.throttle) + math.abs(controls.steer) > 0.1) then
		controls.throttle = (pressed.forward and 1 or 0) - (pressed.reverse and 1 or 0)
		controls.steer = (pressed.right and 1 or 0) - (pressed.left and 1 or 0)
	end
	sendAccumulator += dt
	if sendAccumulator >= 0.11 then
		sendAccumulator = 0
		control:FireServer(controls.throttle, controls.steer)
	end
end)
