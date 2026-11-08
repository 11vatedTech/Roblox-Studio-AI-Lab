local InputController = {}

function InputController.create(player, remotes, inputContextBuilder, controls, getLoadout)
	local function sendCall(slot)
		local loadout = getLoadout()
		local cardId = loadout[slot]
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		if type(cardId) ~= "string" or not root then return end
		local target = root.Position + root.CFrame.LookVector * 8
		remotes.ClientIntent:FireServer({ kind = "call_card", cardId = cardId, position = target })
	end
	local function sendCommand(command)
		remotes.ClientIntent:FireServer({ kind = "command_summons", command = command })
	end
	local context = inputContextBuilder.build(player:WaitForChild("PlayerScripts"), controls, {
		onCall = sendCall,
		onCommand = sendCommand,
	})
	return {
		context = context,
		setLoadout = function() end,
	}
end

return table.freeze(InputController)
