local catalog = require("../src/shared/CardCatalog")
local cards = catalog.getAll()
assert(#cards == 6, "expected six authored cards")
assert(#catalog.getStarterIds() == 3, "expected three starter cards")

local seen = {}
for _, card in ipairs(cards) do
	assert(type(card.id) == "string" and card.id ~= "", "card id must be a non-empty string")
	assert(not seen[card.id], "card ids must be unique")
	seen[card.id] = true
	assert(type(card.arrivalEffect) == "string" and type(card.combatBehavior) == "string", "card mechanics must be authored")
end

assert(catalog.get("morrowbell").style == "ghost", "Morrowbell must keep its authored style")
assert(catalog.get("missing-card") == nil, "unknown cards must not resolve")

local starters = catalog.getStarterIds()
starters[1] = "modified-copy"
assert(catalog.getStarterIds()[1] ~= "modified-copy", "catalog callers must receive a defensive copy")
print("PASS: CardCatalog invariants")
