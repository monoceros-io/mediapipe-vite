function EventController()
{
    const eventListeners = {};
    this.addEventListener = function(event, callback)
    {
        if (!eventListeners[event]) {
            eventListeners[event] = [];
        }
        eventListeners[event].push(callback);
    }
    this.removeEventListener = function(event, callback)
    {
        if (eventListeners[event]) {
            eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
        }
    }
    this.dispatchEvent = function(event, data)
    {
        if (eventListeners[event]) {
            eventListeners[event].forEach(callback => callback(data));
        }
    }
    this.clearEventListeners = function(event)
    {
        if (eventListeners[event]) {
            eventListeners[event] = [];
        }
    }
}

const eventController = new EventController();

export default eventController;