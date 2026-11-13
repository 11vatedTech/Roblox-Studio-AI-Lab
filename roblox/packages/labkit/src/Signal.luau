--!strict
-- LabKit.Signal
-- Synchronous, re-entrant-safe event signal. Handlers connected or disconnected while
-- firing take effect on the next Fire. A failing handler is isolated and reported; it
-- never prevents the remaining handlers from running.

local Signal = {}
Signal.__index = Signal

local Connection = {}
Connection.__index = Connection

local function reportError(message)
	local warnFn = rawget(_G, "warn") or warn
	if type(warnFn) == "function" then
		warnFn("[LabKit.Signal] handler error: " .. tostring(message))
	else
		print("[LabKit.Signal] handler error: " .. tostring(message))
	end
end

Signal.reportError = reportError

function Connection:Disconnect()
	if not self.Connected then
		return
	end
	self.Connected = false
	local handlers = self._signal._handlers
	local index = table.find(handlers, self)
	if index then
		table.remove(handlers, index)
	end
end

Connection.Destroy = Connection.Disconnect

function Signal.new()
	return setmetatable({ _handlers = {}, _destroyed = false }, Signal)
end

function Signal.is(value)
	return type(value) == "table" and getmetatable(value) == Signal
end

function Signal:Connect(handler)
	assert(type(handler) == "function", "Signal:Connect expects a function")
	assert(not self._destroyed, "Cannot connect to a destroyed Signal")
	local connection = setmetatable({ Connected = true, _signal = self, _handler = handler }, Connection)
	table.insert(self._handlers, connection)
	return connection
end

function Signal:Once(handler)
	assert(type(handler) == "function", "Signal:Once expects a function")
	local connection
	connection = self:Connect(function(...)
		connection:Disconnect()
		handler(...)
	end)
	return connection
end

function Signal:Fire(...)
	if self._destroyed then
		return
	end
	local snapshot = table.clone(self._handlers)
	for _, connection in ipairs(snapshot) do
		if connection.Connected then
			local ok, err = pcall(connection._handler, ...)
			if not ok then
				Signal.reportError(err)
			end
		end
	end
end

function Signal:GetConnectionCount()
	return #self._handlers
end

function Signal:DisconnectAll()
	local snapshot = table.clone(self._handlers)
	for _, connection in ipairs(snapshot) do
		connection:Disconnect()
	end
end

function Signal:Destroy()
	self:DisconnectAll()
	self._destroyed = true
end

return Signal
