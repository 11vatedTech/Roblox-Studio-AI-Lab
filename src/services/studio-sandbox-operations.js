// These constants are the entire mutation vocabulary of the disposable-sandbox
// probe. The MCP client validates arguments against them and rejects everything
// else, so this is not a general-purpose editor or Luau executor.
export const SANDBOX_PROJECT = 'lab-sandbox';
export const SANDBOX_PLACE_NAME = 'lab-empty.rbxlx';
export const SANDBOX_SCRIPT_CLASS = 'ModuleScript';
export const SANDBOX_SCRIPT_PATH = 'game.ServerScriptService.LabSandboxProbe';
export const SANDBOX_PROBE_V1 = '-- Lab disposable sandbox probe. Created by scripts/studio-sandbox-probe.mjs.\nreturn { schemaVersion = 1, marker = "LAB_SANDBOX_PROBE_V1" }\n';
export const SANDBOX_PROBE_V2 = '-- Lab disposable sandbox probe. Replaced by scripts/studio-sandbox-probe.mjs.\nreturn { schemaVersion = 2, marker = "LAB_SANDBOX_PROBE_V2" }\n';
export const SANDBOX_UPLOAD_IMAGE_RELATIVE = '.lab-runtime/sandbox/lab-upload-probe.png';

// Deletion is the only Luau the client permits. It only targets the exact probe
// name and verifies the V2 marker before destroying anything.
export const SANDBOX_DELETE_CODE = `local serverScriptService = game:GetService("ServerScriptService")
local target = serverScriptService:FindFirstChild("LabSandboxProbe")
if target == nil then
    return "absent"
end
if not target:IsA("ModuleScript") then
    return "unexpected-class:" .. target.ClassName
end
local source = target.Source
if not (string.find(source, "LAB_SANDBOX_PROBE_V1", 1, true) or string.find(source, "LAB_SANDBOX_PROBE_V2", 1, true)) then
    return "marker-mismatch"
end
target:Destroy()
return "destroyed"
`;

// Device selection is fixed to the latest built-in phone. It does not accept a
// caller-supplied device ID, resolution, or orientation.
export const SANDBOX_DEVICE_SELECT_CODE = `local simulator = game:GetService("StudioDeviceSimulatorService")
local ok, devices = pcall(function()
    return simulator:GetDeviceListAsync()
end)
if not ok then
    return "device-list-error:" .. tostring(devices)
end
local selected = nil
for _, deviceId in ipairs(devices) do
    local infoOk, info = pcall(function()
        return simulator:GetDeviceInfoAsync(deviceId)
    end)
    if infoOk and info then
        local form = tostring(info.DeviceForm or info.deviceForm or "")
        if string.find(form, "Phone", 1, true) then
            selected = deviceId
        end
    end
end
if selected == nil then
    return "no-phone-device"
end
local setOk, setError = pcall(function()
    simulator:SetDeviceAsync(selected)
end)
if not setOk then
    return "device-set-error:" .. tostring(setError)
end
task.wait(0.5)
local camera = workspace.CurrentCamera
local size = camera and camera.ViewportSize or Vector2.new(0, 0)
local currentOk, current = pcall(function()
    return simulator:GetDeviceAsync()
end)
return string.format(
    "selected=%s|device=%s|viewport=%dx%d",
    tostring(selected),
    currentOk and tostring(current) or "unknown",
    math.floor(size.X),
    math.floor(size.Y)
)
`;

export const SANDBOX_DEVICE_RESET_CODE = `local simulator = game:GetService("StudioDeviceSimulatorService")
local ok, err = pcall(function()
    simulator:SetDeviceAsync("default")
end)
if not ok then
    return "device-reset-error:" .. tostring(err)
end
task.wait(0.25)
local camera = workspace.CurrentCamera
local size = camera and camera.ViewportSize or Vector2.new(0, 0)
return string.format("reset|viewport=%dx%d", math.floor(size.X), math.floor(size.Y))
`;

// The same read-only probe runs in the Server and Client DataModels. It never
// creates, moves, or changes a player; it only reports the engine-owned list.
export const SANDBOX_PLAYER_COUNT_CODE = `local players = game:GetService("Players"):GetPlayers()
local names = {}
for _, player in ipairs(players) do
    table.insert(names, tostring(player.Name))
end
table.sort(names)
return string.format("count=%d|names=%s", #players, table.concat(names, ","))
`;
