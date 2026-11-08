local IndexHud = {}
IndexHud.__index = IndexHud

local COLORS = {
	ink = Color3.fromRGB(31, 31, 45),
	paper = Color3.fromRGB(247, 232, 198),
	cream = Color3.fromRGB(255, 247, 224),
	coral = Color3.fromRGB(205, 88, 78),
	teal = Color3.fromRGB(70, 168, 157),
	muted = Color3.fromRGB(119, 108, 97),
}

local function round(guiObject, radius)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, radius or 10)
	corner.Parent = guiObject
end

local function stroke(guiObject, color, thickness)
	local outline = Instance.new("UIStroke")
	outline.Color = color
	outline.Thickness = thickness or 1.5
	outline.Parent = guiObject
	return outline
end

local function makeText(parent, name, text, size, position, fontSize, color, font)
	local label = Instance.new("TextLabel")
	label.Name = name
	label.BackgroundTransparency = 1
	label.Size = size
	label.Position = position
	label.Font = font or Enum.Font.Gotham
	label.Text = text or ""
	label.TextColor3 = color or COLORS.ink
	label.TextScaled = true
	label.TextWrapped = true
	label.Parent = parent
	local limit = Instance.new("UITextSizeConstraint")
	limit.MinTextSize = 9
	limit.MaxTextSize = fontSize or 24
	limit.Parent = label
	return label
end

local function makeButton(parent, name, text, size, position, color)
	local button = Instance.new("TextButton")
	button.Name = name
	button.Size = size
	button.Position = position
	button.BackgroundColor3 = color or COLORS.teal
	button.TextColor3 = COLORS.cream
	button.Font = Enum.Font.GothamBold
	button.Text = text
	button.TextScaled = true
	button.TextWrapped = true
	button.AutoButtonColor = true
	button.Selectable = true
	button.Parent = parent
	round(button, 9)
	local limit = Instance.new("UITextSizeConstraint")
	limit.MinTextSize = 10
	limit.MaxTextSize = 19
	limit.Parent = button
	return button
end

local function makeCreaturePreview(parent, cardId)
	local preview = Instance.new("ViewportFrame")
	preview.Name = "CreaturePreview"
	preview.Size = UDim2.new(0.35, -8, 0.88, 0)
	preview.Position = UDim2.new(0.64, 0, 0.06, 0)
	preview.BackgroundColor3 = Color3.fromRGB(228, 221, 198)
	preview.BackgroundTransparency = 0.12
	preview.BorderSizePixel = 0
	preview.Ambient = Color3.fromRGB(160, 154, 144)
	preview.LightColor = Color3.fromRGB(255, 236, 205)
	preview.LightDirection = Vector3.new(-1, -1, -1)
	preview.Parent = parent
	round(preview, 9)

	local worldModel = Instance.new("WorldModel")
	worldModel.Name = "PreviewWorld"
	worldModel.Parent = preview
	local showcase = workspace:WaitForChild("MisprintWorld"):WaitForChild("TheIndex"):WaitForChild("CardShowcase")
	local source = showcase:WaitForChild("Showcase_" .. cardId)
	local creature = source:Clone()
	creature.Name = "CreaturePreviewModel"
	for _, descendant in ipairs(creature:GetDescendants()) do
		if descendant:IsA("BasePart") then
			descendant.Anchored = true
			descendant.CanCollide = false
			descendant.CanTouch = false
			descendant.CanQuery = false
		end
	end
	creature.Parent = worldModel
	creature:PivotTo(CFrame.new(0, 0, 0) * CFrame.Angles(0, math.pi, 0))
	creature:ScaleTo(0.82)

	local camera = Instance.new("Camera")
	camera.Name = "PreviewCamera"
	camera.FieldOfView = 62
	camera.CFrame = CFrame.lookAt(Vector3.new(0, 2.15, 10), Vector3.new(0, 1.35, 0))
	camera.Parent = preview
	preview.CurrentCamera = camera
	return preview
end

local REASONS = {
	move_to_portal = "Walk up to the glowing portal first.",
	hunt_in_progress = "This hunt has already started.",
	party_full = "The hunt party is full.",
	not_queued = "Join at the portal before starting.",
	loadout_size = "Choose exactly three cards.",
	unowned_card = "That card is still sealed.",
	loadout_locked = "Loadout is locked during a hunt.",
	rate_limited = "One moment, then try again.",
	hunt_active = "Finish the current hunt first.",
}

function IndexHud.new(screenGui, catalog, onIntent)
	local self = setmetatable({ catalog = catalog, onIntent = onIntent, selected = {}, cardViews = {}, owned = {} }, IndexHud)
	local panel = Instance.new("Frame")
	panel.Name = "IndexPanel"
	panel.AnchorPoint = Vector2.new(0.5, 0.5)
	panel.Position = UDim2.fromScale(0.5, 0.5)
	panel.Size = UDim2.fromScale(0.88, 0.84)
	panel.BackgroundColor3 = COLORS.paper
	panel.BackgroundTransparency = 0.02
	panel.Visible = true
	panel.Parent = screenGui
	round(panel, 16)
	stroke(panel, COLORS.ink, 2)
	self.panel = panel

	local header = Instance.new("Frame")
	header.Name = "ArchiveHeader"
	header.Size = UDim2.new(1, -28, 0, 78)
	header.Position = UDim2.new(0, 14, 0, 10)
	header.BackgroundColor3 = COLORS.ink
	header.Parent = panel
	round(header, 12)
	makeText(header, "Title", "MISPRINT MENAGERIE  /  THE INDEX", UDim2.new(0.69, -12, 0.57, 0), UDim2.new(0, 12, 0.08, 0), 28, COLORS.cream, Enum.Font.GothamBold).TextXAlignment = Enum.TextXAlignment.Left
	makeText(header, "SessionNote", "COLLECTION RESETS WHEN YOU LEAVE", UDim2.new(0.69, -12, 0.3, 0), UDim2.new(0, 12, 0.65, 0), 13, Color3.fromRGB(178, 204, 191), Enum.Font.GothamBold).TextXAlignment = Enum.TextXAlignment.Left
	makeText(header, "TeamCount", "1–3 CALLERS", UDim2.new(0.26, -8, 0.76, 0), UDim2.new(0.72, 0, 0.12, 0), 16, COLORS.cream, Enum.Font.GothamBold).TextXAlignment = Enum.TextXAlignment.Right

	local cards = Instance.new("Frame")
	cards.Name = "CardIndex"
	cards.BackgroundTransparency = 1
	cards.Size = UDim2.new(1, -28, 0.61, -10)
	cards.Position = UDim2.new(0, 14, 0, 98)
	cards.Parent = panel
	local grid = Instance.new("UIGridLayout")
	grid.Name = "CardGrid"
	grid.SortOrder = Enum.SortOrder.LayoutOrder
	grid.CellPadding = UDim2.new(0.012, 0, 0.022, 0)
	grid.Parent = cards
	self.grid = grid
	self.cardsFrame = cards

	for index, card in ipairs(catalog.getAll()) do
		local button = Instance.new("TextButton")
		button.Name = "Card_" .. card.id
		button.LayoutOrder = index
		button.BackgroundColor3 = COLORS.cream
		button.Text = ""
		button.AutoButtonColor = true
		button.Selectable = true
		button.Parent = cards
		round(button, 11)
		local outline = stroke(button, Color3.fromRGB(155, 136, 106), 1)
		local title = makeText(button, "Name", card.displayName, UDim2.new(0.64, -10, 0.34, 0), UDim2.new(0, 8, 0.08, 0), 16, COLORS.ink, Enum.Font.GothamBold)
		title.TextXAlignment = Enum.TextXAlignment.Left
		local identity = makeText(button, "Identity", string.upper(card.style) .. "  ·  " .. string.upper(card.role), UDim2.new(0.64, -10, 0.22, 0), UDim2.new(0, 8, 0.42, 0), 12, COLORS.teal, Enum.Font.GothamBold)
		identity.TextXAlignment = Enum.TextXAlignment.Left
		local ability = makeText(button, "Ability", card.shortAbility or card.combatBehavior, UDim2.new(0.64, -12, 0.31, 0), UDim2.new(0, 8, 0.66, 0), 13, COLORS.muted)
		ability.TextScaled = false
		ability.TextSize = 13
		ability.TextXAlignment = Enum.TextXAlignment.Left
		ability.TextYAlignment = Enum.TextYAlignment.Center
		local selectedMark = makeText(button, "Selected", "IN LOADOUT", UDim2.new(0.64, -10, 0.15, 0), UDim2.new(0, 8, 0.01, 0), 10, COLORS.coral, Enum.Font.GothamBold)
		selectedMark.TextXAlignment = Enum.TextXAlignment.Left
		local preview = makeCreaturePreview(button, card.id)
		self.cardViews[card.id] = { button = button, title = title, identity = identity, ability = ability, selectedMark = selectedMark, preview = preview, outline = outline, definition = card }
		button.Activated:Connect(function()
			if not self.owned[card.id] then
				self.status.Text = "Challenge: " .. string.gsub(card.unlockChallengeId or "start_with_this", "_", " ")
				return
			end
			local nextSelected = table.clone(self.selected)
			local found = table.find(nextSelected, card.id)
			if found then
				table.remove(nextSelected, found)
			else
				if #nextSelected == 3 then table.remove(nextSelected, 1) end
				table.insert(nextSelected, card.id)
			end
			self.selected = nextSelected
			self:updateCards()
			if #self.selected == 3 then
				self.status.Text = "Three pages selected. Step into the portal to ready your party."
				self.onIntent("select_loadout", { cardIds = table.clone(self.selected) })
			else
				self.status.Text = string.format("Choose %d more card%s for a hunt loadout.", 3 - #self.selected, #self.selected == 2 and "" or "s")
			end
		end)
	end

	local footer = Instance.new("Frame")
	footer.Name = "IndexActions"
	footer.BackgroundTransparency = 1
	footer.Size = UDim2.new(1, -28, 0.24, 0)
	footer.Position = UDim2.new(0, 14, 0.74, -6)
	footer.Parent = panel
	self.status = makeText(footer, "Status", "Walk to the glowing gate to ready a hunt. Your collection is session-only.", UDim2.new(1, 0, 0.34, 0), UDim2.new(0, 0, 0, 0), 17, COLORS.ink, Enum.Font.GothamMedium)
	self.status.TextXAlignment = Enum.TextXAlignment.Left
	local actions = Instance.new("Frame")
	actions.Name = "Buttons"
	actions.BackgroundTransparency = 1
	actions.Size = UDim2.new(1, 0, 0.56, 0)
	actions.Position = UDim2.new(0, 0, 0.39, 0)
	actions.Parent = footer
	local actionLayout = Instance.new("UIListLayout")
	actionLayout.FillDirection = Enum.FillDirection.Horizontal
	actionLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	actionLayout.Padding = UDim.new(0, 10)
	actionLayout.Parent = actions
	local joinButton = makeButton(actions, "JoinHunt", "READY AT PORTAL", UDim2.new(0.24, 0, 1, 0), UDim2.new(), COLORS.teal)
	local startButton = makeButton(actions, "StartHunt", "START HUNT", UDim2.new(0.24, 0, 1, 0), UDim2.new(), COLORS.coral)
	local retryButton = makeButton(actions, "RetryHunt", "REPLAY HUNT", UDim2.new(0.24, 0, 1, 0), UDim2.new(), COLORS.coral)
	local returnButton = makeButton(actions, "ReturnToIndex", "RETURN TO INDEX", UDim2.new(0.24, 0, 1, 0), UDim2.new(), COLORS.ink)
	joinButton.Activated:Connect(function() self.onIntent("join_hunt") end)
	startButton.Activated:Connect(function() self.onIntent("start_hunt") end)
	retryButton.Activated:Connect(function() self.onIntent("retry_hunt") end)
	returnButton.Activated:Connect(function() self.onIntent("return_to_index") end)
	self.actionButtons = { join = joinButton, start = startButton, retry = retryButton, back = returnButton }
	self:setResponsive()
	local camera = workspace.CurrentCamera
	if camera then
		self.viewportConnection = camera:GetPropertyChangedSignal("ViewportSize"):Connect(function() self:setResponsive() end)
	end
	return self
end

function IndexHud:setResponsive()
	local camera = workspace.CurrentCamera
	local width = camera and camera.ViewportSize.X or 900
	if width < 620 then
		self.grid.CellSize = UDim2.new(0.485, 0, 0.31, 0)
	else
		self.grid.CellSize = UDim2.new(0.325, 0, 0.47, 0)
	end
end

function IndexHud:updateCards()
	for cardId, view in pairs(self.cardViews) do
		local isOwned = self.owned[cardId] == true
		local selected = table.find(self.selected, cardId) ~= nil
		view.button.BackgroundColor3 = selected and Color3.fromRGB(228, 218, 177) or (isOwned and COLORS.cream or Color3.fromRGB(218, 206, 186))
		view.button.BackgroundTransparency = isOwned and 0 or 0.18
		view.identity.TextColor3 = isOwned and COLORS.teal or COLORS.muted
		view.ability.Text = isOwned and (view.definition.shortAbility or view.definition.combatBehavior) or ("SEALED · " .. string.gsub(view.definition.unlockChallengeId or "starter", "_", " "))
		view.preview.ImageColor3 = isOwned and Color3.new(1, 1, 1) or Color3.fromRGB(154, 147, 139)
		view.selectedMark.Visible = selected
		view.outline.Color = selected and COLORS.coral or Color3.fromRGB(155, 136, 106)
		view.outline.Thickness = selected and 2 or 1
	end
end

function IndexHud:render(state)
	self.panel.Visible = state.screen == "index"
	local owned = {}
	for _, cardId in ipairs(state.ownedCardIds or {}) do owned[cardId] = true end
	self.owned = owned
	if type(state.loadout) == "table" and #state.loadout == 3 then self.selected = table.clone(state.loadout) end
	self:updateCards()
	local queueCount = tonumber(state.queuedPlayerCount) or 0
	self.actionButtons.join.Visible = state.phase == "index" or state.phase == "entry"
	self.actionButtons.start.Visible = self.actionButtons.join.Visible and state.isQueued
	self.actionButtons.retry.Visible = state.phase == "reward" or state.phase == "failed"
	self.actionButtons.back.Visible = self.actionButtons.retry.Visible
	self.actionButtons.join.Text = state.isQueued and ("READY · " .. queueCount .. "/3") or "READY AT PORTAL"
	self.actionButtons.start.Text = "START HUNT · " .. queueCount .. "/3"
	local message = REASONS[state.message] or state.message
	if message == "" then
		message = "Walk to the glowing gate to ready a hunt. Your collection is session-only."
	end
	self.status.Text = message
end

return IndexHud
