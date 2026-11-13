--!strict
-- LabKit.Create
-- Small declarative instance builder for UI and runtime geometry.
--
--   Create("TextButton", {
--       Name = "Play", Text = "Play", Size = UDim2.fromOffset(200, 56),
--       [Create.Event("Activated")] = function() ... end,
--       [Create.Children] = { Create("UICorner", { CornerRadius = UDim.new(0, 10) }) },
--   })
--
-- Properties are applied before Parent so the engine replicates and lays out once.
-- The factory is injectable so the builder itself is testable without the engine.

local Create = {}

local EVENT_MARKER = {}
local CHILDREN = { labkitChildrenKey = true }
local PARENT_KEY = "Parent"

Create.Children = CHILDREN

function Create.Event(name)
	return { [EVENT_MARKER] = true, name = name }
end

local function isEventKey(key)
	return type(key) == "table" and key[EVENT_MARKER] == true
end

local function build(factory, className, props, children)
	local instance = factory(className)
	local parent = nil
	local pendingChildren = children or {}
	for key, value in pairs(props or {}) do
		if key == PARENT_KEY then
			parent = value
		elseif key == CHILDREN then
			for _, childInstance in ipairs(value) do
				table.insert(pendingChildren, childInstance)
			end
		elseif isEventKey(key) then
			instance[key.name]:Connect(value)
		else
			instance[key] = value
		end
	end
	for _, childInstance in ipairs(pendingChildren) do
		childInstance.Parent = instance
	end
	if parent ~= nil then
		instance.Parent = parent
	end
	return instance
end

function Create.withFactory(factory)
	return function(className, props, children)
		return build(factory, className, props, children)
	end
end

setmetatable(Create, {
	__call = function(_, className, props, children)
		return build(function(name)
			return Instance.new(name)
		end, className, props, children)
	end,
})

return Create
