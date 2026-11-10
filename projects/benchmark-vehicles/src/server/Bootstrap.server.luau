local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local Rules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("VehicleRules"))

local shared = ReplicatedStorage.BenchmarkShared
local control = Instance.new("RemoteEvent")
control.Name = "VehicleControl"
control.Parent = shared
local status = Instance.new("RemoteEvent")
status.Name = "VehicleStatus"
status.Parent = shared

local world = Instance.new("Folder")
world.Name = "VehicleBenchmark"
world.Parent = Workspace
local function part(parent, name, size, cframe, color, material, anchored)
	local value = Instance.new("Part")
	value.Name = name
	value.Size = size
	value.CFrame = cframe
	value.Color = color
	value.Material = material or Enum.Material.SmoothPlastic
	value.Anchored = anchored
	value.TopSurface = Enum.SurfaceType.Smooth
	value.BottomSurface = Enum.SurfaceType.Smooth
	value.Parent = parent
	return value
end

part(world, "Track", Vector3.new(64, 2, 160), CFrame.new(0, -1, -62), Color3.fromRGB(42, 58, 78), Enum.Material.Asphalt, true)
for _, side in ipairs({ -1, 1 }) do
	part(world, "Rail" .. side, Vector3.new(2, 5, 160), CFrame.new(side * 31, 1.5, -62), Color3.fromRGB(66, 111, 128), Enum.Material.Metal, true)
end
local spawn = Instance.new("SpawnLocation")
spawn.Name = "VehicleStartSpawn"
spawn.Size = Vector3.new(10, 1, 8)
spawn.CFrame = CFrame.new(0, 0.5, 18)
spawn.Anchored = true
spawn.Neutral = true
spawn.AllowTeamChangeOnTouch = false
spawn.Parent = world
local finish = part(world, "FinishGate", Vector3.new(34, 13, 2), CFrame.new(0, 5.5, -132), Color3.fromRGB(243, 181, 78), Enum.Material.Neon, true)
finish.CanCollide = false

local cart = Instance.new("Model")
cart.Name = "ServerOwnedCart"
cart.Parent = world
local chassis = part(cart, "Chassis", Vector3.new(6, 1, 8), CFrame.new(0, 2, 2), Color3.fromRGB(64, 177, 188), Enum.Material.Metal, false)
chassis.CustomPhysicalProperties = PhysicalProperties.new(1.2, 0.7, 0.1)
cart.PrimaryPart = chassis
local seat = Instance.new("VehicleSeat")
seat.Name = "DriverSeat"
seat.Size = Vector3.new(2.5, 1.2, 2.5)
seat.CFrame = chassis.CFrame * CFrame.new(0, 1.1, 0.3)
seat.Color = Color3.fromRGB(32, 44, 62)
seat.Anchored = false
seat.Parent = cart
local seatWeld = Instance.new("WeldConstraint")
seatWeld.Part0 = chassis
seatWeld.Part1 = seat
seatWeld.Parent = chassis
for _, offset in ipairs({ Vector3.new(-2.6, -0.1, -2.2), Vector3.new(2.6, -0.1, -2.2), Vector3.new(-2.6, -0.1, 2.2), Vector3.new(2.6, -0.1, 2.2) }) do
	local wheel = part(cart, "Wheel", Vector3.new(1.1, 1.1, 1.1), chassis.CFrame * CFrame.new(offset), Color3.fromRGB(24, 29, 38), Enum.Material.Rubber, false)
	wheel.Shape = Enum.PartType.Ball
	wheel.Massless = true
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = chassis
	weld.Part1 = wheel
	weld.Parent = chassis
end
local attachment = Instance.new("Attachment")
attachment.Name = "DriveAttachment"
attachment.Parent = chassis
local alignment = Instance.new("AlignOrientation")
alignment.Name = "ServerSteering"
alignment.Mode = Enum.OrientationAlignmentMode.OneAttachment
alignment.Attachment0 = attachment
alignment.MaxTorque = 140000
alignment.Responsiveness = 8
alignment.Parent = chassis
cart:SetAttribute("CourseComplete", false)
cart:SetAttribute("DriverUserId", 0)
chassis:SetNetworkOwner(nil)

local current = { throttle = 0, steer = 0 }
local lastControlAt = {}
local yaw = 0
local stuckFor = 0
local previousPosition = chassis.Position
local statusCooldown = {}
local function driver()
	local humanoid = seat.Occupant
	local character = humanoid and humanoid.Parent
	return character and Players:GetPlayerFromCharacter(character) or nil
end

control.OnServerEvent:Connect(function(player, throttle, steer)
	local now = os.clock()
	if driver() ~= player or cart:GetAttribute("CourseComplete") then return end
	local accepted, reason = Rules.validateInput({ throttle = throttle, steer = steer }, lastControlAt[player.UserId] or now - 0.11, now, 0.09)
	if not accepted then
		if now - (statusCooldown[player.UserId] or -10) > 1 then status:FireClient(player, "Rejected: " .. tostring(reason)); statusCooldown[player.UserId] = now end
		return
	end
	lastControlAt[player.UserId] = accepted.acceptedAt
	current = accepted
	cart:SetAttribute("DriverUserId", player.UserId)
end)

RunService.Heartbeat:Connect(function(deltaTime)
	local dt = math.min(deltaTime, 0.1)
	local activeDriver = driver()
	if not activeDriver then current = { throttle = 0, steer = 0 }; cart:SetAttribute("DriverUserId", 0) end
	yaw += current.steer * dt * 1.35
	alignment.CFrame = CFrame.Angles(0, yaw, 0)
	local velocity = chassis.AssemblyLinearVelocity
	local desired = Vector3.new(-math.sin(yaw) * current.throttle * 38, velocity.Y, -math.cos(yaw) * current.throttle * 38)
	chassis.AssemblyLinearVelocity = desired
	if math.abs(current.throttle) > 0.2 and Vector3.new(velocity.X, 0, velocity.Z).Magnitude < 1.5 then stuckFor += dt else stuckFor = 0 end
	if Rules.shouldRecover(math.abs(chassis.Position.X), stuckFor, 27, 5) then
		chassis.CFrame = CFrame.new(0, 2, 2) * CFrame.Angles(0, yaw, 0)
		chassis.AssemblyLinearVelocity = Vector3.zero
		chassis.AssemblyAngularVelocity = Vector3.zero
		current = { throttle = 0, steer = 0 }
		stuckFor = 0
		status:FireAllClients("Cart reset to the safe start")
	end
	if not cart:GetAttribute("CourseComplete") and chassis.Position.Z <= -121 and math.abs(chassis.Position.X) <= 27 then
		cart:SetAttribute("CourseComplete", true)
		current = { throttle = 0, steer = 0 }
		status:FireAllClients("COURSE COMPLETE")
	end
	previousPosition = chassis.Position
end)

Players.PlayerRemoving:Connect(function(player)
	lastControlAt[player.UserId] = nil
	statusCooldown[player.UserId] = nil
end)
