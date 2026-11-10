local Rules = require("../src/shared/WorldRules")

local first = assert(Rules.generate(417, 6, 5))
local replay = assert(Rules.generate(417, 6, 5))
local alternate = assert(Rules.generate(991, 6, 5))
assert(#first.cells == 30 and #replay.cells == 30, "generator creates the requested world dimensions")
for index, cell in ipairs(first.cells) do
	local other = replay.cells[index]
	for _, direction in ipairs({ "north", "east", "south", "west" }) do
		assert(cell[direction] == other[direction], "same seed reproduces the exact world")
	end
end
local differs = false
for index, cell in ipairs(first.cells) do
	for _, direction in ipairs({ "north", "east", "south", "west" }) do
		if cell[direction] ~= alternate.cells[index][direction] then differs = true end
	end
end
assert(differs, "a different seed changes world connectivity")
local seen, queue = { [1] = true }, { 1 }
local cursor = 1
while cursor <= #queue do
	local index = queue[cursor]
	cursor += 1
	local x, y = ((index - 1) % first.width) + 1, math.floor((index - 1) / first.width) + 1
	for _, direction in ipairs({ { "north", 0, -1 }, { "east", 1, 0 }, { "south", 0, 1 }, { "west", -1, 0 } }) do
		local nx, ny = x + direction[2], y + direction[3]
		if first.cells[index][direction[1]] and nx >= 1 and nx <= first.width and ny >= 1 and ny <= first.height then
			local nextIndex = (ny - 1) * first.width + nx
			if not seen[nextIndex] then seen[nextIndex] = true; table.insert(queue, nextIndex) end
		end
	end
end
assert(#queue == 30, "all generated rooms are reachable through the world graph")
assert(Rules.generate(3, 1, 4) == nil, "unsafe dimensions are rejected")
print("PASS seeded world variation, deterministic replay, connectivity, and dimension bounds")
