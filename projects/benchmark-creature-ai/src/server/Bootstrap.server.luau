local Players = game:GetService("Players")
local PathfindingService = game:GetService("PathfindingService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local Rules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("CreatureRules"))

local world = Instance.new("Folder")
world.Name = "CreatureAIBenchmark"
world.Parent = Workspace
local floor = Instance.new("Part")
floor.Name = "Arena"
floor.Size = Vector3.new(100, 1, 72)
floor.Position = Vector3.new(0, -0.5, 0)
floor.Anchored = true
floor.Material = Enum.Material.Slate
floor.Color = Color3.fromRGB(32, 43, 63)
floor.Parent = world
local spawn = Instance.new("SpawnLocation")
spawn.Name = "CreatureTestSpawn"
spawn.Size = Vector3.new(8, 1, 8)
spawn.Position = Vector3.new(0, 0.5, 24)
spawn.Anchored = true
spawn.Neutral = true
spawn.Parent = world
local obstacle = Instance.new("Part")
obstacle.Name = "NavigationObstacle"
obstacle.Size = Vector3.new(20, 8, 8)
obstacle.Position = Vector3.new(0, 4, -4)
obstacle.Anchored = true
obstacle.Color = Color3.fromRGB(58, 76, 98)
obstacle.Material = Enum.Material.Rock
obstacle.Parent = world

local creature = Instance.new("Model")
creature.Name = "ArchiveCreature"
creature.Parent = world
local body = Instance.new("Part")
body.Name = "Body"
body.Shape = Enum.PartType.Ball
body.Size = Vector3.new(5, 5, 5)
body.Position = Vector3.new(0, 2.5, -25)
body.Anchored = true
body.Material = Enum.Material.Neon
body.Color = Color3.fromRGB(90, 166, 187)
body.Parent = creature
creature.PrimaryPart = body
local eye = Instance.new("Part")
eye.Name = "Eye"
eye.Shape = Enum.PartType.Ball
eye.Size = Vector3.new(1, 1, 1)
eye.Position = body.Position + Vector3.new(0, 0.7, -2.3)
eye.Anchored = true
eye.Material = Enum.Material.Neon
eye.Color = Color3.fromRGB(255, 220, 153)
eye.Parent = creature

local tuning = { noticeRange = 48, telegraph = 1.2, attack = 0.35, recover = 1.4, attackRange = 7 }
local state = { phase = "idle", startedAt = os.clock(), attackCount = 0 }
local path = nil
local waypoints = {}
local waypointIndex = 1
local nextPathAt = 0
local nextStateAt = 0
local lastAttackCount = 0
local function nearestLivingRoot()
	local bestRoot, bestHumanoid, bestDistance
	for _, player in ipairs(Players:GetPlayers()) do
		local character = player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local root = character and character:FindFirstChild("HumanoidRootPart")
		if humanoid and root and humanoid.Health > 0 then
			local distance = (root.Position - body.Position).Magnitude
			if not bestDistance or distance < bestDistance then bestRoot, bestHumanoid, bestDistance = root, humanoid, distance end
		end
	end
	return bestRoot, bestHumanoid, bestDistance or math.huge
end

local pathRequest = 0
local function refreshPath(targetPosition)
	pathRequest += 1
	local requestId = pathRequest
	task.spawn(function()
		local computed = PathfindingService:CreatePath({ AgentRadius = 3, AgentHeight = 8, AgentCanJump = false, WaypointSpacing = 8 })
		local ok = pcall(function() computed:ComputeAsync(body.Position, targetPosition) end)
		if requestId ~= pathRequest or not ok or computed.Status ~= Enum.PathStatus.Success then
			waypoints = {}
			return
		end
		path = computed
		waypoints = computed:GetWaypoints()
		waypointIndex = math.min(2, #waypoints)
	end)
end

local accumulator = 0
RunService.Heartbeat:Connect(function(dt)
	accumulator += dt
	if accumulator < 0.12 then return end
	local stepDt = accumulator
	accumulator = 0
	local targetRoot, targetHumanoid, distance = nearestLivingRoot()
	local now = os.clock()
	if targetRoot and distance <= tuning.noticeRange and now >= nextPathAt and state.phase ~= "attack" then
		nextPathAt = now + 1.2
		refreshPath(targetRoot.Position)
	end
	local nextState = Rules.step(state, distance, now, tuning)
	if nextState then
		state = nextState
		creature:SetAttribute("AIState", state.phase)
	end
	if state.phase == "telegraph" then
		body.Color = Color3.fromRGB(239, 177, 72)
		body.Size = Vector3.new(5.8, 5.8, 5.8)
	elseif state.phase == "attack" then
		body.Color = Color3.fromRGB(240, 91, 82)
		body.Size = Vector3.new(6.6, 6.6, 6.6)
		if state.attackCount ~= lastAttackCount then
			lastAttackCount = state.attackCount
			if targetRoot and targetHumanoid and (targetRoot.Position - body.Position).Magnitude <= tuning.attackRange then targetHumanoid:TakeDamage(12) end
		end
	elseif state.phase == "recover" then
		body.Color = Color3.fromRGB(146, 123, 190)
		body.Size = Vector3.new(4.5, 4.5, 4.5)
	else
		body.Color = Color3.fromRGB(90, 166, 187)
		body.Size = Vector3.new(5, 5, 5)
	end

	if state.phase ~= "attack" and targetRoot and distance <= tuning.noticeRange and #waypoints > 0 and waypointIndex <= #waypoints then
		local destination = waypoints[waypointIndex].Position
		local here = body.Position
		local delta = Vector3.new(destination.X - here.X, 0, destination.Z - here.Z)
		local length = delta.Magnitude
		if length < 2 then waypointIndex = math.min(waypointIndex + 1, #waypoints)
		elseif length > 0 then
			local motion = delta.Unit * math.min(length, 9 * stepDt)
			local nextPosition = here + motion
			body.CFrame = CFrame.lookAt(nextPosition, nextPosition + delta.Unit)
			eye.CFrame = body.CFrame * CFrame.new(0, 0.7, -2.3)
		end
	end
end)
