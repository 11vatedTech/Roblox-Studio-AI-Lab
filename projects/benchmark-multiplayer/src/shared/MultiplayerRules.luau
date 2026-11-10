local MultiplayerRules = {}

function MultiplayerRules.activate(state, userId, stationId, withinRange, now, maximumPairSeconds)
	if type(state) ~= "table" or type(state.activations) ~= "table" or type(userId) ~= "number" or userId <= 0 or userId ~= math.floor(userId) or type(stationId) ~= "string" or type(withinRange) ~= "boolean" or type(now) ~= "number" or now ~= now or math.abs(now) == math.huge or type(maximumPairSeconds) ~= "number" or maximumPairSeconds < 0 or maximumPairSeconds ~= maximumPairSeconds or math.abs(maximumPairSeconds) == math.huge then
		return nil, "malformed"
	end
	if not withinRange then return nil, "out_of_range" end
	if stationId ~= "north" and stationId ~= "south" then return nil, "unknown_station" end
	for _, activation in pairs(state.activations) do
		if type(activation) ~= "table" or type(activation.userId) ~= "number" or type(activation.at) ~= "number" then return nil, "invalid_state" end
		if activation.userId == userId then return nil, "distinct_players_required" end
	end
	local prior = state.activations[stationId]
	local otherStation = stationId == "north" and "south" or "north"
	local other = state.activations[otherStation]
	local activations = table.clone(state.activations)
	activations[stationId] = { userId = userId, at = now }
	local paired = other ~= nil and other.userId ~= userId and math.abs(now - other.at) <= maximumPairSeconds
	return { activations = activations, completed = paired }
end

return table.freeze(MultiplayerRules)
