local shared = game:GetService("ReplicatedStorage"):FindFirstChild("MisprintShared")
assert(shared and shared:FindFirstChild("CardCatalog"), "CardCatalog module is missing")
local catalog = require(shared.CardCatalog)
local cards = catalog.getAll()
assert(#cards == 6, "expected six authored cards")
assert(#catalog.getStarterIds() == 3, "expected three starter cards")
local seen = {}
for _, card in ipairs(cards) do
	assert(type(card.id) == "string" and card.id ~= "", "card id must be a non-empty string")
	assert(not seen[card.id], "card ids must be unique")
	seen[card.id] = true
	assert(type(card.style) == "string" and type(card.role) == "string", "card needs style and role")
	assert(type(card.arrivalEffect) == "string" and type(card.combatBehavior) == "string", "card needs authored mechanics")
end
assert(catalog.get("morrowbell").style == "ghost", "Morrowbell must be the ghost card")
assert(catalog.get("missing-card") == nil, "unknown cards must not resolve")
