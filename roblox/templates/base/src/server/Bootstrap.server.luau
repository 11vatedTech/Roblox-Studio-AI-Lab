-- Server entry point. This check catches an accidental Rojo mapping into a client container.
local RunService = game:GetService("RunService")

assert(RunService:IsServer(), "Bootstrap.server.luau must run on the server")

local SignalService = require(script.Parent.SignalService)
SignalService.start()

print("[11vated Lab] Server-authoritative signal loop started")
