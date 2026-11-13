--!strict
-- LabKit.Retry
-- Bounded exponential backoff with jitter for engine calls that can fail transiently
-- (DataStores, MessagingService, HttpService, MarketplaceService). The wrapped
-- function returns `ok, valueOrError`; thrown errors are caught and treated as failure.

local Retry = {}

local function defaultSleep(seconds)
	local taskLib = rawget(_G, "task") or task
	if taskLib and taskLib.wait then
		taskLib.wait(seconds)
	end
end

function Retry.delayFor(attempt, options)
	local base = options.baseDelay or 0.5
	local maxDelay = options.maxDelay or 8
	local delay = math.min(maxDelay, base * 2 ^ (attempt - 1))
	local jitter = options.jitter or 0.25
	local random = options.random or math.random
	return delay * (1 - jitter + 2 * jitter * random())
end

function Retry.run(fn, options)
	local opts = options or {}
	local attempts = opts.attempts or 5
	local sleep = opts.sleep or defaultSleep
	local lastError = "no attempt made"
	for attempt = 1, attempts do
		local callOk, ok, value = pcall(fn, attempt)
		if callOk and ok then
			return true, value, attempt
		end
		if callOk then
			lastError = value
		else
			lastError = ok
		end
		if opts.shouldRetry and not opts.shouldRetry(lastError) then
			return false, lastError, attempt
		end
		if attempt < attempts then
			sleep(Retry.delayFor(attempt, opts))
		end
	end
	return false, lastError, attempts
end

return Retry
