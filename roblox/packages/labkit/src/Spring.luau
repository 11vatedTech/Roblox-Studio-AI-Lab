--!strict
-- LabKit.Spring
-- Frame-rate independent damped spring for UI motion, camera follow, recoil, and
-- procedural animation. `speed` is the angular frequency (higher = snappier),
-- `damping` is the ratio (1 = critically damped, <1 overshoots). Integration uses
-- fixed 1/240 s sub-steps, so behaviour is identical at 30, 60, and 240 FPS.

local Spring = {}
Spring.__index = Spring

local STEP = 1 / 240
local MAX_STEPS = 240

function Spring.new(initial, options)
	local opts = options or {}
	return setmetatable({
		position = initial or 0,
		velocity = 0,
		target = initial or 0,
		speed = opts.speed or 12,
		damping = opts.damping or 1,
		_accumulator = 0,
	}, Spring)
end

function Spring:setTarget(target)
	self.target = target
end

function Spring:impulse(velocity)
	self.velocity += velocity
end

function Spring:snap(value)
	self.position = value
	self.target = value
	self.velocity = 0
end

function Spring:update(dt)
	assert(type(dt) == "number" and dt >= 0, "Spring:update expects a non-negative dt")
	self._accumulator += dt
	local steps = 0
	local k = self.speed * self.speed
	local c = 2 * self.damping * self.speed
	while self._accumulator >= STEP and steps < MAX_STEPS do
		local acceleration = k * (self.target - self.position) - c * self.velocity
		self.velocity += acceleration * STEP
		self.position += self.velocity * STEP
		self._accumulator -= STEP
		steps += 1
	end
	if steps >= MAX_STEPS then
		self._accumulator = 0
	end
	return self.position
end

function Spring:isSettled(epsilon)
	local e = epsilon or 1e-3
	return math.abs(self.target - self.position) < e and math.abs(self.velocity) < e
end

return Spring
