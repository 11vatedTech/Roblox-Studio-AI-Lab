--!strict
-- Presentation only. Shows Coins (spring-animated), an upgrade shop, toasts, and a
-- settings toggle. All values come from the server's State snapshot; buttons send
-- requests and wait for the server's answer. Sizes use Theme tokens and respect the
-- 44 px minimum touch target, and motion honours the reduced-motion setting.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local LabKit = require(ReplicatedStorage:WaitForChild("Packages"):WaitForChild("LabKit"))
local Shared = ReplicatedStorage:WaitForChild("Shared")
local GameConfig = require(Shared:WaitForChild("GameConfig"))
local Remotes = require(Shared:WaitForChild("Remotes"))

local Create = LabKit.Create
local Theme = LabKit.Theme
local player = Players.LocalPlayer
local net = LabKit.Net.Client.new(Remotes)

local state = nil
local reducedMotion = false
local coinSpring = LabKit.Spring.new(0, { speed = Theme.motion.springSpeed, damping = 1 })

local function corner(radius: number)
	return Create("UICorner", { CornerRadius = UDim.new(0, radius) })
end

local function padding(amount: number)
	return Create("UIPadding", {
		PaddingTop = UDim.new(0, amount),
		PaddingBottom = UDim.new(0, amount),
		PaddingLeft = UDim.new(0, amount),
		PaddingRight = UDim.new(0, amount),
	})
end

local gui = Create("ScreenGui", {
	Name = "LabHud",
	ResetOnSpawn = false,
	IgnoreGuiInset = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
})

local coinLabel = Create("TextLabel", {
	Name = "Coins",
	AnchorPoint = Vector2.new(0, 0),
	Position = UDim2.fromOffset(Theme.spacing.lg, Theme.spacing.lg),
	Size = UDim2.fromOffset(220, 52),
	BackgroundColor3 = Theme.color("surface"),
	BackgroundTransparency = 0.1,
	TextColor3 = Theme.color("primary"),
	Font = Enum.Font.GothamBold,
	TextSize = Theme.text.title,
	TextXAlignment = Enum.TextXAlignment.Left,
	Text = "0 Coins",
	Parent = gui,
	[Create.Children] = { corner(Theme.radius.md), padding(Theme.spacing.md) },
})

local shopToggle = Create("TextButton", {
	Name = "ShopToggle",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -Theme.spacing.lg, 0, Theme.spacing.lg),
	Size = UDim2.fromOffset(120, math.max(Theme.minTouchTarget, 52)),
	BackgroundColor3 = Theme.color("primary"),
	TextColor3 = Theme.color("primaryText"),
	Font = Enum.Font.GothamBold,
	TextSize = Theme.text.label,
	Text = "Upgrades",
	AutoButtonColor = true,
	Parent = gui,
	[Create.Children] = { corner(Theme.radius.md) },
})

local shop = Create("Frame", {
	Name = "Shop",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -Theme.spacing.lg, 0, 80),
	Size = UDim2.fromOffset(320, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	BackgroundColor3 = Theme.color("surface"),
	Visible = false,
	Parent = gui,
	[Create.Children] = {
		corner(Theme.radius.lg),
		padding(Theme.spacing.md),
		Create("UIListLayout", { Padding = UDim.new(0, Theme.spacing.sm), SortOrder = Enum.SortOrder.LayoutOrder }),
	},
})

local toast = Create("TextLabel", {
	Name = "Toast",
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -Theme.spacing.xxl),
	Size = UDim2.fromOffset(360, 48),
	BackgroundColor3 = Theme.color("surfaceRaised"),
	TextColor3 = Theme.color("text"),
	Font = Enum.Font.GothamMedium,
	TextSize = Theme.text.body,
	TextWrapped = true,
	Visible = false,
	Parent = gui,
	[Create.Children] = { corner(Theme.radius.md) },
})

local settingsButton = Create("TextButton", {
	Name = "MotionToggle",
	AnchorPoint = Vector2.new(0, 0),
	Position = UDim2.fromOffset(Theme.spacing.lg, 80),
	Size = UDim2.fromOffset(220, Theme.minTouchTarget),
	BackgroundColor3 = Theme.color("surfaceRaised"),
	TextColor3 = Theme.color("textMuted"),
	Font = Enum.Font.Gotham,
	TextSize = Theme.text.caption,
	Text = "Reduced motion: off",
	Parent = gui,
	[Create.Children] = { corner(Theme.radius.sm) },
})

local rows: { [string]: TextButton } = {}

local function showToast(message: string)
	toast.Text = message
	toast.Visible = true
	if not reducedMotion then
		toast.BackgroundTransparency = 1
		TweenService:Create(toast, TweenInfo.new(Theme.motion.base), { BackgroundTransparency = 0 }):Play()
	end
	task.delay(2.5, function()
		if toast.Text == message then
			toast.Visible = false
		end
	end)
end

local function render()
	if state == nil then
		return
	end
	coinSpring:setTarget(state.coins)
	if reducedMotion then
		coinSpring:snap(state.coins)
	end
	for index, upgrade in ipairs(state.upgrades) do
		local config = GameConfig.upgrades[upgrade.id]
		local row = rows[upgrade.id]
		if row == nil then
			row = Create("TextButton", {
				Name = upgrade.id,
				LayoutOrder = index,
				Size = UDim2.new(1, 0, 0, 64),
				BackgroundColor3 = Theme.color("surfaceRaised"),
				TextColor3 = Theme.color("text"),
				Font = Enum.Font.GothamMedium,
				TextSize = Theme.text.body,
				TextWrapped = true,
				Parent = shop,
				[Create.Event("Activated")] = function()
					local ok, result = net:invoke("BuyUpgrade", upgrade.id)
					if ok then
						state = result
						render()
					elseif result == "insufficient_funds" then
						showToast("Not enough Coins yet.")
					elseif result == "max_level" then
						showToast("Already at max level.")
					end
				end,
				[Create.Children] = { corner(Theme.radius.sm) },
			}) :: TextButton
			rows[upgrade.id] = row
		end
		local affordable = upgrade.cost ~= nil and state.coins >= upgrade.cost
		if upgrade.cost == nil then
			row.Text = string.format("%s  •  Lv %d (max)", config.displayName, upgrade.level)
		else
			row.Text = string.format("%s  •  Lv %d → %d  •  %d Coins\n%s", config.displayName, upgrade.level, upgrade.level + 1, upgrade.cost, config.description)
		end
		row.BackgroundColor3 = if affordable then Theme.color("info") else Theme.color("surfaceRaised")
	end
	if state.settings then
		reducedMotion = state.settings.reducedMotion == true
		settingsButton.Text = "Reduced motion: " .. (if reducedMotion then "on" else "off")
	end
end

shopToggle.Activated:Connect(function()
	shop.Visible = not shop.Visible
end)

settingsButton.Activated:Connect(function()
	if state == nil or state.settings == nil then
		return
	end
	local settings = table.clone(state.settings)
	settings.reducedMotion = not settings.reducedMotion
	state.settings = settings
	net:fire("UpdateSettings", settings)
	render()
end)

net:on("State", function(snapshot)
	state = snapshot
	render()
end)

net:on("Toast", function(message)
	if type(message) == "string" then
		showToast(message)
	end
end)

RunService.RenderStepped:Connect(function(dt)
	local value = coinSpring:update(dt)
	coinLabel.Text = string.format("%d %s", math.floor(value + 0.5), GameConfig.currency)
end)

gui.Parent = player:WaitForChild("PlayerGui")

task.spawn(function()
	local ok, snapshot = net:invoke("GetState")
	if ok then
		state = snapshot
		render()
	end
end)
