--!strict
-- LabKit.Rng
-- Deterministic xorshift32 generator. The same seed produces the same sequence on
-- every server, client, and the CLI, which makes procedural worlds, daily challenges,
-- replays, and loot tests reproducible. Not cryptographic: never derive secrets from it.

local Rng = {}
Rng.__index = Rng

local UINT32 = 4294967296

-- FNV-1a 32-bit. h * 16777619 is computed as (h << 24) + h * 403 to stay exact in doubles.
function Rng.hashString(text)
	assert(type(text) == "string", "hashString expects a string")
	local hash = 2166136261
	for index = 1, #text do
		hash = bit32.bxor(hash, string.byte(text, index))
		hash = (bit32.lshift(hash, 24) + hash * 403) % UINT32
	end
	return hash
end

function Rng.new(seed)
	local state
	if type(seed) == "string" then
		state = Rng.hashString(seed)
	else
		assert(type(seed) == "number" and seed == seed, "Rng seed must be a number or string")
		state = math.floor(math.abs(seed)) % UINT32
	end
	if state == 0 then
		state = 0x9E3779B9
	end
	return setmetatable({ _state = state }, Rng)
end

function Rng:nextUInt32()
	local x = self._state
	x = bit32.bxor(x, bit32.lshift(x, 13))
	x = bit32.bxor(x, bit32.rshift(x, 17))
	x = bit32.bxor(x, bit32.lshift(x, 5))
	self._state = x
	return x
end

-- Uniform float in [0, 1).
function Rng:next()
	return self:nextUInt32() / UINT32
end

-- Uniform integer in [min, max] inclusive.
function Rng:integer(min, max)
	assert(min <= max, "Rng:integer expects min <= max")
	return min + math.floor(self:next() * (max - min + 1))
end

function Rng:number(min, max)
	return min + self:next() * (max - min)
end

function Rng:chance(probability)
	return self:next() < probability
end

function Rng:pick(array)
	assert(#array > 0, "Rng:pick expects a non-empty array")
	return array[self:integer(1, #array)]
end

-- In-place Fisher-Yates shuffle; returns the same array.
function Rng:shuffle(array)
	for index = #array, 2, -1 do
		local swap = self:integer(1, index)
		array[index], array[swap] = array[swap], array[index]
	end
	return array
end

-- entries: { { value = any, weight = positive number }, ... }
function Rng:weighted(entries)
	local total = 0
	for _, entry in ipairs(entries) do
		assert(type(entry.weight) == "number" and entry.weight >= 0, "weights must be non-negative numbers")
		total += entry.weight
	end
	assert(total > 0, "Rng:weighted needs a positive total weight")
	local roll = self:next() * total
	for _, entry in ipairs(entries) do
		roll -= entry.weight
		if roll < 0 then
			return entry.value, entry
		end
	end
	return entries[#entries].value, entries[#entries]
end

function Rng:state()
	return self._state
end

function Rng:fork(label)
	return Rng.new(bit32.bxor(self:nextUInt32(), Rng.hashString(label or "fork")))
end

return Rng
