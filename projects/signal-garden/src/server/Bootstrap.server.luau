local RunService = game:GetService("RunService")
assert(RunService:IsServer(), "Signal Garden must boot on the server")

local GardenService = require(script.Parent.GardenService)
GardenService.start()
print("[Signal Garden] Cooperative marsh loop started; live Studio validation remains an explicit release gate.")
