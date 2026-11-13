--!strict
-- LabKit.Inventory
-- Catalog-validated stackable inventory stored in a profile data table as
-- `data.items = { [itemId] = count }`. Capacity is counted in slots, where each item
-- uses ceil(count / maxStack) slots. Unknown item IDs are always rejected, so a client
-- can never name an item into existence.

local Inventory = {}
Inventory.__index = Inventory

function Inventory.new(catalog, options)
	assert(type(catalog) == "table", "Inventory.new expects a catalog")
	for itemId, entry in pairs(catalog) do
		assert(type(itemId) == "string", "catalog item IDs must be strings")
		assert(type(entry) == "table", "catalog entry " .. itemId .. " must be a table")
		local maxStack = entry.maxStack or 1
		assert(type(maxStack) == "number" and maxStack >= 1 and maxStack % 1 == 0, "maxStack must be a positive integer for " .. itemId)
	end
	local opts = options or {}
	return setmetatable({ catalog = catalog, capacity = opts.capacity or 100 }, Inventory)
end

local function ensure(data)
	data.items = data.items or {}
	return data.items
end

function Inventory:count(data, itemId)
	return ensure(data)[itemId] or 0
end

function Inventory:slotsUsed(data)
	local used = 0
	for itemId, count in pairs(ensure(data)) do
		local entry = self.catalog[itemId]
		local maxStack = (entry and entry.maxStack) or 1
		used += math.ceil(count / maxStack)
	end
	return used
end

local function validCount(count)
	return type(count) == "number" and count == count and count >= 1 and count % 1 == 0 and count <= 1e9
end

function Inventory:canAdd(data, itemId, count)
	local entry = self.catalog[itemId]
	if entry == nil then
		return false, "unknown_item"
	end
	if not validCount(count) then
		return false, "invalid_count"
	end
	local items = ensure(data)
	local maxStack = entry.maxStack or 1
	local current = items[itemId] or 0
	if entry.unique and current + count > 1 then
		return false, "unique_item"
	end
	local slotDelta = math.ceil((current + count) / maxStack) - math.ceil(current / maxStack)
	if self:slotsUsed(data) + slotDelta > self.capacity then
		return false, "inventory_full"
	end
	return true
end

function Inventory:add(data, itemId, count)
	local amount = count or 1
	local ok, reason = self:canAdd(data, itemId, amount)
	if not ok then
		return false, reason
	end
	local items = ensure(data)
	items[itemId] = (items[itemId] or 0) + amount
	return true
end

function Inventory:remove(data, itemId, count)
	local amount = count or 1
	if self.catalog[itemId] == nil then
		return false, "unknown_item"
	end
	if not validCount(amount) then
		return false, "invalid_count"
	end
	local items = ensure(data)
	local current = items[itemId] or 0
	if current < amount then
		return false, "insufficient_items"
	end
	if current == amount then
		items[itemId] = nil
	else
		items[itemId] = current - amount
	end
	return true
end

-- Returns a sorted, client-safe view for UI replication.
function Inventory:list(data)
	local result = {}
	for itemId, count in pairs(ensure(data)) do
		local entry = self.catalog[itemId] or {}
		table.insert(result, { id = itemId, count = count, name = entry.name or itemId, category = entry.category })
	end
	table.sort(result, function(a, b)
		return a.id < b.id
	end)
	return result
end

return Inventory
