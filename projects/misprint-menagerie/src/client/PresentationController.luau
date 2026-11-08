local PresentationController = {}
PresentationController.__index = PresentationController

function PresentationController.new(hudState, indexHud, encounterHud)
	return setmetatable({
		state = hudState.initial(),
		hudState = hudState,
		indexHud = indexHud,
		encounterHud = encounterHud,
	}, PresentationController)
end

function PresentationController:receive(payload)
	self.state = self.hudState.reduce(self.state, payload)
	self.indexHud:render(self.state)
	self.encounterHud:render(self.state)
	return self.state
end

function PresentationController:getState()
	return self.state
end

return PresentationController
