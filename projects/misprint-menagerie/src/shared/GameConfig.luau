local GameConfig = {
	ExperienceName = "Misprint Menagerie",
	MaxPlayersPerHunt = 3,
	MaxActiveSummonsPerPlayer = 2,
	LoadoutSize = 3,
	Arena = {
		Min = Vector3.new(-40, 0, -40),
		Max = Vector3.new(40, 30, 40),
		Entry = Vector3.new(0, 4, 27),
		BossSpawn = Vector3.new(0, 5, -13),
	},
	Rates = {
		RequestCooldownSeconds = 0.2,
		MaxTargetDistance = 48,
	},
}

return table.freeze(GameConfig)
