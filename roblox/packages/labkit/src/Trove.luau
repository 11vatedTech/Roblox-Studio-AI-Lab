--!strict
-- LabKit.Trove
-- Deterministic lifetime cleanup. Every connection, instance, thread, callback, or
-- object a system creates is registered with a Trove and released in reverse order
-- when the owner (player session, round, UI screen, NPC) ends. Cleanup errors are
-- isolated so one bad item never leaks the rest.

local Trove = {}
Trove.__index = Trove

local function cleanupItem(item, method)
	if method ~= nil then
		local fn = item[method]
		assert(type(fn) == "function", "Trove cleanup method is not a function: " .. tostring(method))
		fn(item)
		return
	end
	local kind = typeof(item)
	if kind == "function" then
		item()
	elseif kind == "RBXScriptConnection" then
		item:Disconnect()
	elseif kind == "Instance" then
		item:Destroy()
	elseif kind == "thread" then
		local taskLib = rawget(_G, "task") or task
		if taskLib and taskLib.cancel then
			pcall(taskLib.cancel, item)
		end
	elseif kind == "table" then
		if type(item.Destroy) == "function" then
			item:Destroy()
		elseif type(item.Disconnect) == "function" then
			item:Disconnect()
		elseif type(item.Clean) == "function" then
			item:Clean()
		else
			error("Trove cannot clean a table without Destroy, Disconnect, or Clean")
		end
	else
		error("Trove cannot clean a value of type " .. kind)
	end
end

function Trove.new()
	return setmetatable({ _items = {}, _cleaning = false }, Trove)
end

function Trove:Add(item, method)
	assert(item ~= nil, "Trove:Add expects a value")
	assert(not self._cleaning, "Cannot add to a Trove while it is cleaning")
	table.insert(self._items, { item = item, method = method })
	return item
end

function Trove:Connect(signal, handler)
	return self:Add(signal:Connect(handler))
end

function Trove:Extend()
	local child = Trove.new()
	self:Add(child, "Clean")
	return child
end

function Trove:Remove(item)
	for index = #self._items, 1, -1 do
		local entry = self._items[index]
		if entry.item == item then
			table.remove(self._items, index)
			cleanupItem(entry.item, entry.method)
			return true
		end
	end
	return false
end

function Trove:Count()
	return #self._items
end

function Trove:Clean()
	if self._cleaning then
		return
	end
	self._cleaning = true
	local failures = {}
	while #self._items > 0 do
		local entry = table.remove(self._items)
		local ok, err = pcall(cleanupItem, entry.item, entry.method)
		if not ok then
			table.insert(failures, tostring(err))
		end
	end
	self._cleaning = false
	if #failures > 0 then
		local warnFn = rawget(_G, "warn") or warn or print
		warnFn("[LabKit.Trove] " .. #failures .. " cleanup error(s): " .. table.concat(failures, "; "))
	end
	return #failures == 0
end

Trove.Destroy = Trove.Clean

return Trove
