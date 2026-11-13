--!strict
local DataService = require(script.Parent:WaitForChild("DataService"))
local GameService = require(script.Parent:WaitForChild("GameService"))

GameService.start()
DataService.start()
print("[Lab] Production template started; data mode = " .. tostring(DataService.mode))
