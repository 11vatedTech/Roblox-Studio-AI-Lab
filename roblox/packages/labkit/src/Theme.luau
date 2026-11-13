--!strict
-- LabKit.Theme
-- Design tokens for consistent, readable, device-aware UI. Templates and generated UI
-- reference tokens instead of hard-coded pixels so a game can be re-skinned in one
-- place and still meet minimum touch-target and contrast requirements.
-- Colours are stored as {r, g, b} 0-255 triples so the module also runs outside Roblox;
-- `Theme.color(name)` returns a Color3 inside the engine.

local Theme = {}

Theme.palette = {
	background = { 14, 17, 24 },
	surface = { 24, 29, 40 },
	surfaceRaised = { 34, 41, 56 },
	stroke = { 58, 68, 90 },
	text = { 240, 243, 250 },
	textMuted = { 168, 177, 196 },
	primary = { 255, 184, 48 },
	primaryText = { 26, 20, 6 },
	success = { 74, 222, 128 },
	danger = { 248, 96, 96 },
	info = { 96, 165, 250 },
	rarityCommon = { 190, 196, 208 },
	rarityRare = { 80, 160, 255 },
	rarityEpic = { 186, 104, 255 },
	rarityLegendary = { 255, 178, 40 },
}

Theme.spacing = { xxs = 2, xs = 4, sm = 8, md = 12, lg = 16, xl = 24, xxl = 32 }
Theme.radius = { sm = 6, md = 10, lg = 16, pill = 999 }
Theme.text = {
	caption = 14,
	body = 18,
	label = 20,
	title = 28,
	display = 40,
}
-- Roblox recommends touch targets of at least 44x44 points on mobile.
Theme.minTouchTarget = 44
Theme.motion = { fast = 0.12, base = 0.2, slow = 0.35, springSpeed = 18 }

-- Relative luminance per WCAG 2.x.
local function channel(value)
	local c = value / 255
	if c <= 0.03928 then
		return c / 12.92
	end
	return ((c + 0.055) / 1.055) ^ 2.4
end

function Theme.luminance(rgb)
	return 0.2126 * channel(rgb[1]) + 0.7152 * channel(rgb[2]) + 0.0722 * channel(rgb[3])
end

function Theme.contrast(a, b)
	local la = Theme.luminance(a)
	local lb = Theme.luminance(b)
	local lighter = math.max(la, lb)
	local darker = math.min(la, lb)
	return (lighter + 0.05) / (darker + 0.05)
end

function Theme.rgb(name)
	local value = Theme.palette[name]
	assert(value ~= nil, "unknown palette colour " .. tostring(name))
	return value
end

function Theme.color(name)
	local value = Theme.rgb(name)
	return Color3.fromRGB(value[1], value[2], value[3])
end

-- Scales text for small viewports while never dropping below a readable floor.
function Theme.textSize(token, viewportHeight)
	local base = Theme.text[token]
	assert(base ~= nil, "unknown text token " .. tostring(token))
	local scale = math.clamp((viewportHeight or 720) / 720, 0.8, 1.4)
	return math.max(12, math.floor(base * scale + 0.5))
end

return Theme
