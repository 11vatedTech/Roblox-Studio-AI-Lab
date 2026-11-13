--!strict
-- LabKit.StateMachine
-- Explicit finite state machine for round flow, NPC behaviour, abilities, UI screens,
-- and quest steps. Transitions must be declared; guards may veto; enter/exit hooks run
-- in a fixed order (exit old -> update -> enter new -> Changed).

local function import(name)
	if script ~= nil then
		return require(script.Parent[name])
	end
	return require("./" .. name)
end

local Signal = import("Signal")

local StateMachine = {}
StateMachine.__index = StateMachine

function StateMachine.new(definition)
	assert(type(definition) == "table", "StateMachine.new expects a definition")
	assert(type(definition.states) == "table", "definition.states is required")
	assert(definition.states[definition.initial] ~= nil, "initial state must be declared")
	for name, state in pairs(definition.states) do
		for _, target in ipairs(state.transitions or {}) do
			assert(definition.states[target] ~= nil, "state " .. name .. " transitions to undeclared " .. target)
		end
	end
	local self = setmetatable({
		states = definition.states,
		state = definition.initial,
		clock = definition.clock or os.clock,
		Changed = Signal.new(),
		history = {},
		_transitioning = false,
	}, StateMachine)
	self.enteredAt = self.clock()
	local initial = self.states[self.state]
	if initial.enter then
		initial.enter(self, nil)
	end
	return self
end

function StateMachine:can(target, ...)
	local current = self.states[self.state]
	if self.states[target] == nil then
		return false, "unknown_state"
	end
	if table.find(current.transitions or {}, target) == nil then
		return false, "transition_not_allowed"
	end
	local guard = self.states[target].guard
	if guard and not guard(self, self.state, ...) then
		return false, "guard_rejected"
	end
	return true
end

function StateMachine:transition(target, ...)
	if self._transitioning then
		return false, "reentrant_transition"
	end
	local ok, reason = self:can(target, ...)
	if not ok then
		return false, reason
	end
	self._transitioning = true
	local previous = self.state
	local exitFn = self.states[previous].exit
	if exitFn then
		exitFn(self, target)
	end
	self.state = target
	self.enteredAt = self.clock()
	table.insert(self.history, target)
	if #self.history > 32 then
		table.remove(self.history, 1)
	end
	local enterFn = self.states[target].enter
	if enterFn then
		enterFn(self, previous, ...)
	end
	self._transitioning = false
	self.Changed:Fire(target, previous)
	return true
end

function StateMachine:timeInState()
	return self.clock() - self.enteredAt
end

function StateMachine:is(name)
	return self.state == name
end

function StateMachine:Destroy()
	self.Changed:Destroy()
end

return StateMachine
