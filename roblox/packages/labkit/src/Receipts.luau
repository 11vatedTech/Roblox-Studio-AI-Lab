--!strict
-- LabKit.Receipts
-- Correct MarketplaceService.ProcessReceipt handling for developer products.
--
-- Roblox may call ProcessReceipt repeatedly for the same PurchaseId (server restart,
-- player rejoin, callback error). The only safe answer is "PurchaseGranted" after the
-- grant AND the PurchaseId marker are persisted together. This module:
--   1. returns "retry" when the buyer's profile is not loaded on this server;
--   2. on first sight, runs the product handler and records the PurchaseId inside
--      the same profile (so both save in one write);
--   3. returns "granted" only after a successful save; otherwise "retry", and the next
--      call sees the receipt in memory and only re-attempts the save (never re-grants).
--
--   MarketplaceService.ProcessReceipt = Receipts.bind(Receipts.new({
--       getProfile = function(userId) return store:get(tostring(userId)) end,
--       products = { [123456] = function(profile, info) return economy:grant(...) end },
--   }))

local Receipts = {}
Receipts.__index = Receipts

function Receipts.new(options)
	assert(type(options) == "table", "Receipts.new expects options")
	assert(type(options.getProfile) == "function", "getProfile is required")
	assert(type(options.products) == "table", "products is required")
	return setmetatable({
		getProfile = options.getProfile,
		products = options.products,
		onEvent = options.onEvent,
	}, Receipts)
end

function Receipts:_event(kind, info, detail)
	if self.onEvent then
		self.onEvent(kind, info, detail)
	end
end

-- Returns "granted" or "retry".
function Receipts:process(info)
	if type(info) ~= "table" or info.PurchaseId == nil or info.PlayerId == nil then
		return "retry"
	end
	local purchaseId = tostring(info.PurchaseId)
	local profile = self.getProfile(info.PlayerId)
	if profile == nil or not profile:isActive() then
		self:_event("profile_unavailable", info)
		return "retry"
	end
	if profile:hasReceipt(purchaseId) then
		if profile:hasUnsavedReceipts() then
			local saved = profile:save()
			if not saved then
				return "retry"
			end
		end
		self:_event("duplicate", info)
		return "granted"
	end
	local handler = self.products[info.ProductId]
	if handler == nil then
		self:_event("unknown_product", info)
		return "retry"
	end
	local ok, result, detail = pcall(handler, profile, info)
	if not ok or result == false then
		self:_event("handler_failed", info, ok and detail or result)
		return "retry"
	end
	profile:addReceipt(purchaseId)
	local saved, err = profile:save()
	if not saved then
		self:_event("save_failed", info, err)
		return "retry"
	end
	self:_event("granted", info)
	return "granted"
end

-- Produces a ProcessReceipt callback that maps to Enum.ProductPurchaseDecision.
function Receipts.bind(receipts)
	return function(info)
		if receipts:process(info) == "granted" then
			return Enum.ProductPurchaseDecision.PurchaseGranted
		end
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
end

return Receipts
