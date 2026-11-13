--!strict
-- LabKit.RateLimiter
-- Token bucket keyed by player (or any key). Each key starts full, spends tokens per
-- request, and refills continuously. Use one limiter per remote or per action class.

local RateLimiter = {}
RateLimiter.__index = RateLimiter

function RateLimiter.new(options)
	assert(type(options) == "table", "RateLimiter.new expects options")
	local capacity = options.capacity
	local refill = options.refillPerSecond
	assert(type(capacity) == "number" and capacity > 0, "capacity must be positive")
	assert(type(refill) == "number" and refill >= 0, "refillPerSecond must be non-negative")
	return setmetatable({
		capacity = capacity,
		refillPerSecond = refill,
		_clock = options.clock or os.clock,
		_buckets = {},
	}, RateLimiter)
end

function RateLimiter:_bucket(key)
	local now = self._clock()
	local bucket = self._buckets[key]
	if bucket == nil then
		bucket = { tokens = self.capacity, updatedAt = now }
		self._buckets[key] = bucket
		return bucket
	end
	local elapsed = math.max(0, now - bucket.updatedAt)
	bucket.tokens = math.min(self.capacity, bucket.tokens + elapsed * self.refillPerSecond)
	bucket.updatedAt = now
	return bucket
end

function RateLimiter:consume(key, cost)
	local amount = cost or 1
	assert(type(amount) == "number" and amount > 0, "cost must be positive")
	local bucket = self:_bucket(key)
	if bucket.tokens + 1e-9 < amount then
		return false
	end
	bucket.tokens -= amount
	return true
end

function RateLimiter:remaining(key)
	return self:_bucket(key).tokens
end

function RateLimiter:remove(key)
	self._buckets[key] = nil
end

return RateLimiter
