local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")
local Rules = require(ReplicatedStorage:WaitForChild("BenchmarkShared"):WaitForChild("CombatRules"))

local shared = ReplicatedStorage.BenchmarkShared
local presentation = Instance.new("RemoteEvent")
presentation.Name = "AttackPresentation"
presentation.Parent = shared

local function part(parent, name, size, position, color, material)
	local value = Instance.new("Part")
	value.Name = name
	value.Size = size
	value.Position = position
	value.Color = color
	value.Material = material or Enum.Material.SmoothPlastic
	value.Anchored = true
	value.TopSurface = Enum.SurfaceType.Smooth
	value.BottomSurface = Enum.SurfaceType.Smooth
	value.Parent = parent
	return value
end

local world = Instance.new("Folder")
world.Name = "CombatBenchmark"
world.Parent = Workspace
part(world, "ArenaFloor", Vector3.new(56, 1, 56), Vector3.new(0, -0.5, 0), Color3.fromRGB(28, 38, 54), Enum.Material.Slate)
local dummy = Instance.new("Model")
dummy.Name = "CombatTrainingDummy"
dummy.Parent = world
local core = part(dummy, "Core", Vector3.new(2.2, 3.8, 1.2), Vector3.new(0, 2.4, -12), Color3.fromRGB(60, 176, 192), Enum.Material.Metal)
core.Anchored = true
local head = part(dummy, "Head", Vector3.new(1.6, 1.6, 1.6), Vector3.new(0, 5.2, -12), Color3.fromRGB(228, 214, 181), Enum.Material.SmoothPlastic)
local arm = part(dummy, "SwingArm", Vector3.new(0.8, 2.7, 0.8), Vector3.new(1.3, 2.5, -12), Color3.fromRGB(229, 150, 73), Enum.Material.Metal)
arm.Anchored = false
arm.CanCollide = false
arm.Massless = true
local shoulder = Instance.new("Motor6D")
shoulder.Name = "TrainingShoulder"
shoulder.Part0 = core
shoulder.Part1 = arm
shoulder.C0 = CFrame.new(1.4, 0.7, 0)
shoulder.C1 = CFrame.new(0, -0.8, 0)
shoulder.Parent = core
dummy.PrimaryPart = core
dummy:SetAttribute("Health", 100)
dummy:SetAttribute("MaxHealth", 100)
local prompt = Instance.new("ProximityPrompt")
prompt.Name = "TrainingStrike"
prompt.ActionText = "Test strike"
prompt.ObjectText = "Training dummy"
prompt.KeyboardKeyCode = Enum.KeyCode.E
prompt.GamepadKeyCode = Enum.KeyCode.ButtonX
prompt.HoldDuration = 0
prompt.MaxActivationDistance = 9
prompt.RequiresLineOfSight = true
prompt.Parent = core

local healthLabel = Instance.new("BillboardGui")
healthLabel.Name = "TrainingHealth"
healthLabel.Size = UDim2.fromOffset(180, 42)
healthLabel.StudsOffset = Vector3.new(0, 3.4, 0)
healthLabel.AlwaysOnTop = true
healthLabel.Parent = core
local healthText = Instance.new("TextLabel")
healthText.Size = UDim2.fromScale(1, 1)
healthText.BackgroundTransparency = 0.15
healthText.BackgroundColor3 = Color3.fromRGB(15, 21, 32)
healthText.TextColor3 = Color3.fromRGB(235, 242, 247)
healthText.Font = Enum.Font.GothamBold
healthText.TextScaled = true
healthText.Parent = healthLabel

local tuning = { windup = 0.3, active = 0.18, recovery = 0.42, cooldown = 0.35 }
local states = {}
local lastPromptAt = {}
local targetHealth = 100
local function updateLabel()
	healthText.Text = string.format("TARGET  %d / 100", targetHealth)
end
updateLabel()

prompt.Triggered:Connect(function(player)
	local now = os.clock()
	if now - (lastPromptAt[player.UserId] or -10) < 0.25 then return end
	lastPromptAt[player.UserId] = now
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not root or not humanoid or humanoid.Health <= 0 or (root.Position - core.Position).Magnitude > prompt.MaxActivationDistance + 1 then return end
	local current = states[player.UserId] or { phase = "idle", startedAt = now, cooldownUntil = 0, hitTargetIds = {} }
	local nextState = Rules.advance(current, now, tuning)
	if not nextState or nextState.phase ~= "windup" then return end
	states[player.UserId] = nextState
	presentation:FireClient(player, "swing")
	task.delay(tuning.windup, function()
		local active = states[player.UserId]
		if not active then return end
		active = Rules.advance(active, os.clock(), tuning)
		if not active or active.phase ~= "active" then states[player.UserId] = active; return end
		states[player.UserId] = active
		local latestCharacter = player.Character
		local latestRoot = latestCharacter and latestCharacter:FindFirstChild("HumanoidRootPart")
		local latestHumanoid = latestCharacter and latestCharacter:FindFirstChildOfClass("Humanoid")
		if latestRoot and latestHumanoid and latestHumanoid.Health > 0 then
			local hit, reason = Rules.resolveHit(active, dummy.Name, (latestRoot.Position - core.Position).Magnitude, 8, 18, targetHealth)
			if hit then
				active.hitTargetIds = hit.hitTargetIds
				targetHealth = hit.remainingHealth
				core.Color = Color3.fromRGB(245, 111, 93)
				updateLabel()
				if targetHealth == 0 then
					task.delay(1.2, function()
						targetHealth = 100
						core.Color = Color3.fromRGB(60, 176, 192)
						updateLabel()
					end)
				else
					task.delay(0.18, function() if core.Parent and targetHealth > 0 then core.Color = Color3.fromRGB(60, 176, 192) end end)
				end
			else
				presentation:FireClient(player, "miss", reason)
			end
		end
		task.delay(tuning.active, function()
			local later = states[player.UserId]
			if later then states[player.UserId] = Rules.advance(later, os.clock(), tuning) end
		end)
	end)
end)

Players.PlayerRemoving:Connect(function(player)
	states[player.UserId] = nil
	lastPromptAt[player.UserId] = nil
end)
