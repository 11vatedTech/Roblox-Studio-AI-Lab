local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local shared = ReplicatedStorage:WaitForChild("MisprintShared")
local protocol = require(shared:WaitForChild("RemoteProtocol"))
local catalog = require(shared:WaitForChild("CardCatalog"))
local hudState = require(shared:WaitForChild("HudState"))
local remoteFolder = ReplicatedStorage:WaitForChild(protocol.FolderName)
local clientIntent = remoteFolder:WaitForChild(protocol.Events.ClientIntent)
local serverUpdate = remoteFolder:WaitForChild(protocol.Events.ServerUpdate)

local IndexHud = require(script.Parent:WaitForChild("IndexHud"))
local EncounterHud = require(script.Parent:WaitForChild("EncounterHud"))
local InputContextBuilder = require(script.Parent:WaitForChild("InputContextBuilder"))
local InputController = require(script.Parent:WaitForChild("InputController"))
local PresentationController = require(script.Parent:WaitForChild("PresentationController"))

local screenGui = Instance.new("ScreenGui")
screenGui.Name = "MisprintMenagerieUI"
screenGui.ResetOnSpawn = false
screenGui.DisplayOrder = 25
screenGui.IgnoreGuiInset = false
screenGui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screenGui.Parent = player:WaitForChild("PlayerGui")

local function sendIntent(kind, fields)
	local payload = fields or {}
	payload.kind = kind
	clientIntent:FireServer(payload)
end

local indexHud = IndexHud.new(screenGui, catalog, sendIntent)
local encounterHud = EncounterHud.new(screenGui, catalog, sendIntent)
local presentation = PresentationController.new(hudState, indexHud, encounterHud)
local input = InputController.create(player, { ClientIntent = clientIntent }, InputContextBuilder, encounterHud:getControls(), function()
	return presentation:getState().loadout
end)

serverUpdate.OnClientEvent:Connect(function(payload)
	if type(payload) == "table" then presentation:receive(payload) end
end)

indexHud:render(presentation:getState())
encounterHud:render(presentation:getState())
print("Misprint Menagerie client ready · Input Action System bindings installed")
