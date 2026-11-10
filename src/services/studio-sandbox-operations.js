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
