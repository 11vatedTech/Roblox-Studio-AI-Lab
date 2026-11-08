local InputContextBuilder = {}

local function bindAction(context, name, keyboardKey, gamepadKey, button, callback)
	local action = Instance.new("InputAction")
	action.Name = name
	action.Type = Enum.InputActionType.Bool
	action.Parent = context
	action.Pressed:Connect(callback)

	local function addBinding(bindingName, keyCode, uiButton)
		local binding = Instance.new("InputBinding")
		binding.Name = bindingName
		if keyCode then binding.KeyCode = keyCode end
		if uiButton then binding.UIButton = uiButton end
		binding.Parent = action
	end

	addBinding("Keyboard", keyboardKey)
	addBinding("Gamepad", gamepadKey)
	addBinding("Touch", nil, button)
	return action
end

function InputContextBuilder.build(playerScripts, controls, callbacks)
	local existing = playerScripts:FindFirstChild("MisprintPlayContext")
	if existing then existing:Destroy() end
	local context = Instance.new("InputContext")
	context.Name = "MisprintPlayContext"
	context.Priority = 1200
	context.Sink = false
	context.Enabled = true
	context.Parent = playerScripts
	local callKeys = { Enum.KeyCode.One, Enum.KeyCode.Two, Enum.KeyCode.Three }
	local gamepadCallKeys = { Enum.KeyCode.ButtonX, Enum.KeyCode.ButtonY, Enum.KeyCode.ButtonB }
	for slot = 1, 3 do
		bindAction(context, "CallPage" .. slot, callKeys[slot], gamepadCallKeys[slot], controls.callButtons[slot], function()
			callbacks.onCall(slot)
		end)
	end
	local commandKeys = {
		follow = { Enum.KeyCode.F, Enum.KeyCode.DPadLeft },
		hold = { Enum.KeyCode.G, Enum.KeyCode.DPadDown },
		focus = { Enum.KeyCode.H, Enum.KeyCode.DPadRight },
	}
	for command, keys in pairs(commandKeys) do
		bindAction(context, "Command_" .. command, keys[1], keys[2], controls.commandButtons[command], function()
			callbacks.onCommand(command)
		end)
	end
	return context
end

return table.freeze(InputContextBuilder)
