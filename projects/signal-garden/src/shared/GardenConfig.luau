return table.freeze({
	StateRemoteName = "SignalGardenState",
	RequestRemoteName = "SignalGardenRequestState",
	FragmentTag = "SignalGardenEcho",
	RequiredDeposits = 3,
	PromptDistance = 12,
	PlayerActionCooldown = 0.45,
	RouteWindowSeconds = 18,
	ResetSeconds = 28,
	FragmentRespawnSeconds = 15,
	RouteNames = table.freeze({ Moss = "Moss", Bloom = "Bloom" }),
})
