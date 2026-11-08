local EncounterHud = {}
EncounterHud.__index = EncounterHud

local COLORS = {
	ink = Color3.fromRGB(31, 31, 45),
	paper = Color3.fromRGB(247, 232, 198),
	cream = Color3.fromRGB(255, 247, 224),
	coral = Color3.fromRGB(205, 88, 78),
	teal = Color3.fromRGB(70, 168, 157),
}

local function round(guiObject, radius)
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, radius or 10)
	corner.Parent = guiObject
end

local function label(parent, name, text, size, position, color, maxSize, font)
	local result = Instance.new("TextLabel")
	result.Name = name
	result.BackgroundTransparency = 1
	result.Size = size
	result.Position = position
	result.Font = font or Enum.Font.GothamBold
	result.Text = text or ""
	result.TextColor3 = color or COLORS.ink
	result.TextScaled = true
	result.TextWrapped = true
	result.Parent = parent
	local limit = Instance.new("UITextSizeConstraint")
	limit.MinTextSize = 10
	limit.MaxTextSize = maxSize or 22
	limit.Parent = result
	return result
end

local function button(parent, name, text, color)
	local result = Instance.new("TextButton")
	result.Name = name
	result.BackgroundColor3 = color
	result.TextColor3 = COLORS.cream
	result.Font = Enum.Font.GothamBold
	result.Text = text
	result.TextScaled = true
	result.TextWrapped = true
	result.AutoButtonColor = true
	result.Selectable = true
	result.Parent = parent
	round(result, 10)
	local limit = Instance.new("UITextSizeConstraint")
	limit.MinTextSize = 11
	limit.MaxTextSize = 18
	limit.Parent = result
	return result
end

function EncounterHud.new(screenGui, catalog, onIntent)
	local self = setmetatable({ catalog = catalog, onIntent = onIntent, callButtons = {}, commandButtons = {} }, EncounterHud)
	local panel = Instance.new("Frame")
	panel.Name = "EncounterPanel"
	panel.Size = UDim2.fromScale(1, 1)
	panel.BackgroundTransparency = 1
	panel.Visible = false
	panel.Parent = screenGui
	self.panel = panel

	local top = Instance.new("Frame")
	top.Name = "BossHud"
	top.AnchorPoint = Vector2.new(0.5, 0)
	top.Position = UDim2.new(0.5, 0, 0.025, 0)
	top.Size = UDim2.new(0.72, 0, 0, 108)
	top.BackgroundColor3 = COLORS.ink
	top.BackgroundTransparency = 0.08
	top.Parent = panel
	round(top, 13)
	label(top, "BossTitle", "THE REDACTOR", UDim2.new(0.5, -12, 0.31, 0), UDim2.new(0, 10, 0, 6), COLORS.cream, 24, Enum.Font.GothamBlack).TextXAlignment = Enum.TextXAlignment.Left
	self.phase = label(top, "Phase", "PHASE I", UDim2.new(0.45, -10, 0.31, 0), UDim2.new(0.52, 0, 0, 6), Color3.fromRGB(181, 214, 198), 18, Enum.Font.GothamBold)
	local barBack = Instance.new("Frame")
	barBack.Name = "HealthBack"
	barBack.Size = UDim2.new(1, -20, 0, 20)
	barBack.Position = UDim2.new(0, 10, 0.43, 0)
	barBack.BackgroundColor3 = Color3.fromRGB(89, 77, 79)
	barBack.Parent = top
	round(barBack, 7)
	self.healthFill = Instance.new("Frame")
	self.healthFill.Name = "HealthFill"
	self.healthFill.Size = UDim2.fromScale(1, 1)
	self.healthFill.BackgroundColor3 = COLORS.coral
	self.healthFill.Parent = barBack
	round(self.healthFill, 7)
	self.healthText = label(top, "HealthText", "300 / 300", UDim2.new(1, -20, 0, 22), UDim2.new(0, 10, 0.68, 0), COLORS.cream, 14, Enum.Font.GothamBold)

	self.warning = label(panel, "WarningCaption", "", UDim2.new(0.86, 0, 0, 55), UDim2.new(0.07, 0, 0.18, 0), COLORS.cream, 20, Enum.Font.GothamBlack)
	self.warning.BackgroundColor3 = COLORS.coral
	self.warning.BackgroundTransparency = 0.08
	self.warning.Visible = false
	round(self.warning, 10)
	self.message = label(panel, "CombatMessage", "", UDim2.new(0.84, 0, 0, 42), UDim2.new(0.08, 0, 0.265, 0), COLORS.cream, 17, Enum.Font.GothamBold)
	self.message.BackgroundColor3 = COLORS.ink
	self.message.BackgroundTransparency = 0.2
	self.message.Visible = false
	round(self.message, 9)

	local instruction = label(panel, "Objective", "Dodge the ink-red marks. Call and direct your pages.", UDim2.new(0.68, 0, 0, 42), UDim2.new(0.04, 0, 0.78, 0), COLORS.cream, 16)
	instruction.BackgroundColor3 = COLORS.ink
	instruction.BackgroundTransparency = 0.12
	round(instruction, 9)
	self.objective = instruction
	self.capacity = label(panel, "SummonCapacity", "SUMMONS 0 / 2", UDim2.new(0.22, 0, 0, 42), UDim2.new(0.74, 0, 0.78, 0), COLORS.cream, 15)
	self.capacity.BackgroundColor3 = COLORS.teal
	self.capacity.BackgroundTransparency = 0.04
	round(self.capacity, 9)

	local callBar = Instance.new("Frame")
	callBar.Name = "CallBar"
	callBar.AnchorPoint = Vector2.new(0.5, 1)
	callBar.Position = UDim2.new(0.5, 0, 0.97, 0)
	callBar.Size = UDim2.new(0.78, 0, 0, 90)
	callBar.BackgroundTransparency = 1
	callBar.Parent = panel
	local callLayout = Instance.new("UIListLayout")
	callLayout.FillDirection = Enum.FillDirection.Horizontal
	callLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	callLayout.Padding = UDim.new(0, 9)
	callLayout.Parent = callBar
	for slot = 1, 3 do
		local call = button(callBar, "CallSlot" .. slot, "CALL PAGE " .. slot, COLORS.teal)
		call.Size = UDim2.new(0.32, 0, 1, 0)
		self.callButtons[slot] = call
	end

	local commandBar = Instance.new("Frame")
	commandBar.Name = "SummonCommands"
	commandBar.AnchorPoint = Vector2.new(1, 0)
	commandBar.Position = UDim2.new(0.985, 0, 0.34, 0)
	commandBar.Size = UDim2.new(0.18, 0, 0, 155)
	commandBar.BackgroundTransparency = 1
	commandBar.Parent = panel
	local commandLayout = Instance.new("UIListLayout")
	commandLayout.FillDirection = Enum.FillDirection.Vertical
	commandLayout.VerticalAlignment = Enum.VerticalAlignment.Center
	commandLayout.Padding = UDim.new(0, 6)
	commandLayout.Parent = commandBar
	for _, command in ipairs({ "follow", "hold", "focus" }) do
		local commandButton = button(commandBar, "Command_" .. command, string.upper(command), COLORS.ink)
		commandButton.Size = UDim2.new(1, 0, 0, 44)
		self.commandButtons[command] = commandButton
	end

	local result = Instance.new("Frame")
	result.Name = "ResultPanel"
	result.AnchorPoint = Vector2.new(0.5, 0.5)
	result.Position = UDim2.fromScale(0.5, 0.55)
	result.Size = UDim2.new(0.58, 0, 0, 205)
	result.BackgroundColor3 = COLORS.paper
	result.Visible = false
	result.Parent = panel
	round(result, 14)
	self.result = result
	self.resultText = label(result, "ResultText", "", UDim2.new(1, -28, 0.54, 0), UDim2.new(0, 14, 0, 12), COLORS.ink, 24, Enum.Font.GothamBold)
	local resultButtons = Instance.new("Frame")
	resultButtons.Name = "ResultActions"
	resultButtons.BackgroundTransparency = 1
	resultButtons.Size = UDim2.new(1, -20, 0.31, 0)
	resultButtons.Position = UDim2.new(0, 10, 0.66, 0)
	resultButtons.Parent = result
	local resultLayout = Instance.new("UIListLayout")
	resultLayout.FillDirection = Enum.FillDirection.Horizontal
	resultLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
	resultLayout.Padding = UDim.new(0, 10)
	resultLayout.Parent = resultButtons
	local retry = button(resultButtons, "Retry", "REPLAY HUNT", COLORS.coral)
	retry.Size = UDim2.new(0.46, 0, 1, 0)
	local returnButton = button(resultButtons, "Return", "RETURN TO INDEX", COLORS.ink)
	returnButton.Size = UDim2.new(0.46, 0, 1, 0)
	retry.Activated:Connect(function() self.onIntent("retry_hunt") end)
	returnButton.Activated:Connect(function() self.onIntent("return_to_index") end)
	self.objective.Text = "Dodge the ink-red marks. Call and direct your pages."
	return self
end

function EncounterHud:render(state)
	self.panel.Visible = state.screen == "encounter"
	self.result.Visible = state.phase == "reward" or state.phase == "failed"
	self.phase.Text = (state.phase == "phase_two" and "PHASE II · REDRAW" or state.phase == "reward" and "HUNT COMPLETE" or state.phase == "failed" and "HUNT ENDED" or "PHASE I · FIRST STAMP")
	local maxHealth = math.max(1, tonumber(state.bossMaxHealth) or 300)
	local health = math.clamp(tonumber(state.bossHealth) or maxHealth, 0, maxHealth)
	self.healthFill.Size = UDim2.new(health / maxHealth, 0, 1, 0)
	self.healthText.Text = string.format("%d / %d", math.ceil(health), math.ceil(maxHealth))
	self.capacity.Text = string.format("SUMMONS %d / 2", math.min(2, tonumber(state.activeSummonCount) or 0))
	self.objective.Text = state.objective or "Dodge the ink-red marks. Call and direct your pages."
	self.warning.Text = state.telegraph or ""
	self.warning.Visible = type(state.telegraph) == "string" and state.telegraph ~= ""
	self.message.Text = state.message or ""
	self.message.Visible = type(state.message) == "string" and state.message ~= ""
	self.resultText.Text = state.message or (state.phase == "reward" and "The Index is safe. Your earned pages last for this session." or "The party was erased. No reward was granted.")
	for slot, call in ipairs(self.callButtons) do
		local cardId = state.loadout and state.loadout[slot]
		local definition = cardId and self.catalog.get(cardId)
		call.Visible = definition ~= nil
		call:SetAttribute("CardId", cardId or "")
		call.Text = definition and (definition.displayName .. "\n" .. string.upper(definition.role)) or "NO PAGE"
	end
	for _, commandButton in pairs(self.commandButtons) do commandButton.Visible = not self.result.Visible end
	for _, callButton in ipairs(self.callButtons) do callButton.Visible = callButton.Visible and not self.result.Visible end
end

function EncounterHud:getControls()
	return { callButtons = self.callButtons, commandButtons = self.commandButtons }
end

return EncounterHud
