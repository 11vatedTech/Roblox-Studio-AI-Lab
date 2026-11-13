--!strict
-- LabKit.Schema
-- Runtime validators for every value that crosses a trust boundary: remote arguments,
-- loaded save data, configuration, and Studio-authored attributes. A schema is a
-- function `(value, path?) -> (boolean, string?)`. Validators reject NaN/infinity,
-- oversized strings and tables, unknown struct keys, and sparse arrays by default,
-- because exploit clients send exactly those values.

local Schema = {}

local DEFAULT_MAX_STRING = 200
local DEFAULT_MAX_ARRAY = 64
local DEFAULT_MAX_MAP = 64

local function fail(path, message)
	if path ~= nil and path ~= "" then
		return false, path .. ": " .. message
	end
	return false, message
end

local function child(path, key)
	local base = path or ""
	if type(key) == "number" then
		return base .. "[" .. tostring(key) .. "]"
	end
	if base == "" then
		return tostring(key)
	end
	return base .. "." .. tostring(key)
end

local function isFinite(value)
	return value == value and value ~= math.huge and value ~= -math.huge
end

Schema.isFinite = isFinite

function Schema.number(options)
	local opts = options or {}
	return function(value, path)
		if type(value) ~= "number" then
			return fail(path, "expected number, got " .. typeof(value))
		end
		if not isFinite(value) then
			return fail(path, "number must be finite")
		end
		if opts.integer and value % 1 ~= 0 then
			return fail(path, "expected integer")
		end
		if opts.min ~= nil and value < opts.min then
			return fail(path, "must be >= " .. tostring(opts.min))
		end
		if opts.max ~= nil and value > opts.max then
			return fail(path, "must be <= " .. tostring(opts.max))
		end
		return true
	end
end

function Schema.integer(options)
	local opts = table.clone(options or {})
	opts.integer = true
	return Schema.number(opts)
end

function Schema.string(options)
	local opts = options or {}
	local maxLength = opts.maxLength or DEFAULT_MAX_STRING
	return function(value, path)
		if type(value) ~= "string" then
			return fail(path, "expected string, got " .. typeof(value))
		end
		if #value > maxLength then
			return fail(path, "string exceeds " .. tostring(maxLength) .. " bytes")
		end
		if opts.minLength ~= nil and #value < opts.minLength then
			return fail(path, "string shorter than " .. tostring(opts.minLength) .. " bytes")
		end
		if utf8.len(value) == nil then
			return fail(path, "string is not valid UTF-8")
		end
		if opts.pattern ~= nil and string.match(value, opts.pattern) == nil then
			return fail(path, "string does not match the required pattern")
		end
		return true
	end
end

function Schema.boolean()
	return function(value, path)
		if type(value) ~= "boolean" then
			return fail(path, "expected boolean, got " .. typeof(value))
		end
		return true
	end
end

function Schema.literal(expected)
	return function(value, path)
		if value ~= expected then
			return fail(path, "expected " .. tostring(expected))
		end
		return true
	end
end

function Schema.enum(values)
	assert(type(values) == "table" and #values > 0, "Schema.enum expects a non-empty array")
	local allowed = {}
	for _, item in ipairs(values) do
		allowed[item] = true
	end
	return function(value, path)
		if allowed[value] ~= true then
			return fail(path, "value is not one of the allowed options")
		end
		return true
	end
end

function Schema.optional(inner)
	return function(value, path)
		if value == nil then
			return true
		end
		return inner(value, path)
	end
end

function Schema.union(...)
	local options = { ... }
	assert(#options > 0, "Schema.union expects at least one schema")
	return function(value, path)
		for _, option in ipairs(options) do
			if option(value, path) then
				return true
			end
		end
		return fail(path, "value matched no allowed shape")
	end
end

local function countKeys(value, limit)
	local count = 0
	for _ in pairs(value) do
		count += 1
		if count > limit then
			return count
		end
	end
	return count
end

function Schema.array(inner, options)
	local opts = options or {}
	local maxLength = opts.maxLength or DEFAULT_MAX_ARRAY
	return function(value, path)
		if type(value) ~= "table" then
			return fail(path, "expected array, got " .. typeof(value))
		end
		local keyCount = countKeys(value, maxLength + 1)
		if keyCount > maxLength then
			return fail(path, "array exceeds " .. tostring(maxLength) .. " items")
		end
		if keyCount ~= #value then
			return fail(path, "array must be a dense sequence")
		end
		if opts.minLength ~= nil and keyCount < opts.minLength then
			return fail(path, "array has fewer than " .. tostring(opts.minLength) .. " items")
		end
		for index = 1, keyCount do
			local ok, err = inner(value[index], child(path, index))
			if not ok then
				return false, err
			end
		end
		return true
	end
end

function Schema.map(keySchema, valueSchema, options)
	local opts = options or {}
	local maxEntries = opts.maxEntries or DEFAULT_MAX_MAP
	return function(value, path)
		if type(value) ~= "table" then
			return fail(path, "expected map, got " .. typeof(value))
		end
		if countKeys(value, maxEntries + 1) > maxEntries then
			return fail(path, "map exceeds " .. tostring(maxEntries) .. " entries")
		end
		for key, item in pairs(value) do
			local keyOk, keyErr = keySchema(key, child(path, "<key>"))
			if not keyOk then
				return false, keyErr
			end
			local ok, err = valueSchema(item, child(path, key))
			if not ok then
				return false, err
			end
		end
		return true
	end
end

-- Struct fields are checked in sorted order so error messages are deterministic.
function Schema.struct(fields, options)
	local opts = options or {}
	local strict = opts.strict ~= false
	local names = {}
	for name in pairs(fields) do
		table.insert(names, name)
	end
	table.sort(names)
	return function(value, path)
		if type(value) ~= "table" then
			return fail(path, "expected table, got " .. typeof(value))
		end
		if strict then
			for key in pairs(value) do
				if fields[key] == nil then
					return fail(path, "unexpected field " .. tostring(key))
				end
			end
		end
		for _, name in ipairs(names) do
			local ok, err = fields[name](value[name], child(path, name))
			if not ok then
				return false, err
			end
		end
		return true
	end
end

function Schema.instance(className)
	return function(value, path)
		if typeof(value) ~= "Instance" then
			return fail(path, "expected Instance, got " .. typeof(value))
		end
		if className ~= nil and not value:IsA(className) then
			return fail(path, "expected " .. className)
		end
		return true
	end
end

function Schema.vector3(options)
	local opts = options or {}
	return function(value, path)
		if typeof(value) ~= "Vector3" then
			return fail(path, "expected Vector3, got " .. typeof(value))
		end
		if not (isFinite(value.X) and isFinite(value.Y) and isFinite(value.Z)) then
			return fail(path, "Vector3 components must be finite")
		end
		if opts.maxMagnitude ~= nil and value.Magnitude > opts.maxMagnitude then
			return fail(path, "Vector3 magnitude exceeds " .. tostring(opts.maxMagnitude))
		end
		return true
	end
end

function Schema.custom(predicate, message)
	return function(value, path)
		local ok, result = pcall(predicate, value)
		if ok and result == true then
			return true
		end
		return fail(path, message or "custom validation failed")
	end
end

function Schema.check(schema, value)
	return schema(value, "")
end

function Schema.assert(schema, value, label)
	local ok, err = schema(value, label or "")
	if not ok then
		error(err, 2)
	end
	return value
end

return Schema
