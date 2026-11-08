-- Client requests contain intent only. All state, rewards, and rejection reasons come from the server.
local RemoteProtocol = {
	FolderName = "MisprintRemotes",
	Events = {
		ClientIntent = "ClientIntent",
		ServerUpdate = "ServerUpdate",
	},
	Intents = {
		JoinHunt = "join_hunt",
		SelectLoadout = "select_loadout",
		StartHunt = "start_hunt",
		CallCard = "call_card",
		CommandSummons = "command_summons",
		ReturnToIndex = "return_to_index",
		RetryHunt = "retry_hunt",
	},
	Updates = {
		Snapshot = "snapshot",
		EncounterState = "encounter_state",
		CallRejected = "call_rejected",
		IntentRejected = "intent_rejected",
		CardUnlocked = "card_unlocked",
	},
}

return table.freeze(RemoteProtocol)
