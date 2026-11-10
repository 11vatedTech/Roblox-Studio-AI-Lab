local WorldRules = {}

local function finite(value)
	return type(value) == "number" and value == value and math.abs(value) < math.huge
end

local DIRECTIONS = {
	{ key = "north", opposite = "south", dx = 0, dy = -1 },
	{ key = "east", opposite = "west", dx = 1, dy = 0 },
	{ key = "south", opposite = "north", dx = 0, dy = 1 },
	{ key = "west", opposite = "east", dx = -1, dy = 0 },
}

local function makeRandom(seed)
	local value = math.floor(math.abs(seed)) % 2147483647
	if value == 0 then value = 1 end
	return function(maximum)
		value = (value * 48271) % 2147483647
		return (value % maximum) + 1
	end
end

function WorldRules.generate(seed, width, height)
	if not finite(seed) or not finite(width) or not finite(height) or width < 2 or height < 2 or width > 32 or height > 32 or width ~= math.floor(width) or height ~= math.floor(height) then
		return nil, "invalid_dimensions_or_seed"
	end
	local random = makeRandom(seed)
	local cells = table.create(width * height)
	for index = 1, width * height do cells[index] = { north = false, east = false, south = false, west = false, explored = false } end
	local function indexOf(x, y) return (y - 1) * width + x end
	local start = random(width * height)
	local stack = { start }
	cells[start].explored = true
	while #stack > 0 do
		local currentIndex = stack[#stack]
		local x = ((currentIndex - 1) % width) + 1
		local y = math.floor((currentIndex - 1) / width) + 1
		local neighbors = {}
		for _, direction in ipairs(DIRECTIONS) do
			local nx, ny = x + direction.dx, y + direction.dy
			if nx >= 1 and nx <= width and ny >= 1 and ny <= height then
				local nextIndex = indexOf(nx, ny)
				if not cells[nextIndex].explored then table.insert(neighbors, { index = nextIndex, direction = direction }) end
			end
		end
		if #neighbors == 0 then
			table.remove(stack)
		else
			local chosen = neighbors[random(#neighbors)]
			local direction = chosen.direction
			cells[currentIndex][direction.key] = true
			cells[chosen.index][direction.opposite] = true
			cells[chosen.index].explored = true
			table.insert(stack, chosen.index)
		end
	end
	for _, cell in ipairs(cells) do cell.explored = nil end
	return { seed = seed, width = width, height = height, cells = cells }
end

return table.freeze(WorldRules)
