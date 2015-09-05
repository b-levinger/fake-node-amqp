'use strict';
var Q = require("q");
var _ = require("underscore");

var MockRouter = function() {
	this._bindings = [];
	this._allExchanges = [];
	this._allQueues = [];
};

MockRouter.prototype.reset = function() {
	var that = this;
	_.each(that._allExchanges, function(exchange) {
		exchange.removeAllListeners("MOCK_BROADCAST_DATA");
		exchange.removeAllListeners("MOCK_BROADCAST_DATA");
	});

	_.each(that._allExchanges, function(ex) {
		ex.emit("close");
	});

	_.each(that._allQueues, function(q) {
		q._events.emit("close");
	});

	that._bindings = [];
	that._allExchanges = [];
	that._allQueues = [];
};

// obj is instance of MockBindable
MockRouter.prototype.bindObj = function(obj, exchangeName, routingKey) {
	var that = this;

	var regexMatch = (routingKey || "").replace(/([\$\^\\\/\(\)\?\+\[\]\{\}])/ig, "\\$1").replace(/\*/g, "[^\.]+").replace(/#/g, ".*");

	that._bindings.push({
		exchangeName : exchangeName,
		routingKey : routingKey,
		routingRgx : new RegExp("^" + regexMatch + "$"),
		obj : obj
	});
};

//obj is instance of MockBindable
MockRouter.prototype.unbindObjAll = function(obj) {
	this._bindings = _.filter(this._bindings, function(binding) {
		return binding.obj !== obj;
	});
};

//obj is instance of MockBindable
MockRouter.prototype.unbindObjFrom = function(obj, exchangeName, routingKey) {
	var that = this;
	this._bindings = _.filter(this._bindings, function(binding) {
		return binding.obj !== obj && binding.exchangeName !== exchangeName;
	});
};

MockRouter.prototype._publishFanout = function(exchange, data, routingKey, options) {
	var that = this;
	var bindings = _.filter(that._bindings, function(binding) {
		return binding.exchangeName === exchange.name;
	});
	_.each(bindings, function(binding) {
		binding.obj.mockDataReceived(data, routingKey, options, exchange);
	});
};

MockRouter.prototype._publishDirect = function(exchange, data, routingKey, options) {
	var that = this;
	var bindings = _.filter(that._bindings, function(binding) {
		return binding.exchangeName === exchange.name && binding.routingKey === routingKey;
	});
	_.each(bindings, function(binding) {
		binding.obj.mockDataReceived(data, routingKey, options, exchange);
	});
};

MockRouter.prototype._publishTopic = function(exchange, data, routingKey, options) {
	var that = this;
	var bindings = _.filter(that._bindings, function(binding) {
		return binding.exchangeName === exchange.name && (routingKey === binding.routingKey || routingKey && routingKey.match && routingKey.match(binding.routingRgx));
	});

	_.each(bindings, function(binding) {
		binding.obj.mockDataReceived(data, routingKey, options, exchange);
	});
};

MockRouter.prototype._publishHeaders = function(exchange, data, routingKey, options) {
	//TODO figure this one out
};

//exchange is instance of MockExchange
MockRouter.prototype.addExchange = function(exchange) {
	var that = this;
	var exchangesWithSameName = _.filter(that._allExchanges, function(ex) {
		return ex.name === exchange.name;
	});

	if (exchange.options.passive) {
		if (exchangesWithSameName.length === 0) {
			var e = {
				code : 404
			};
			throw e;
		}
	}

	that._allExchanges.push(exchange);

	exchange.on("MOCK_PUBLISH_DATA", function(exchangeType, data, routingKey, options) {
		switch (exchangeType) {
		case "direct":
			that._publishDirect(exchange, data, routingKey, options);
			break;
		case "fanout":
			that._publishFanout(exchange, data, routingKey, options);
			break;
		case "topic":
			that._publishTopic(exchange, data, routingKey, options);
			break;
		case "headers":
			that._publishHeaders(exchange, data, routingKey, options);
			break;
		}
	});
};

//exchange is instance of MockExchange
MockRouter.prototype.removeExchange = function(exchange) {
	var that = this;
	exchange.removeAllListeners("MOCK_PUBLISH_DATA");

	var idx = that._allExchanges.indexOf(exchange);
	if (idx > -1) {
		that._allExchanges.splice(idx, 1);
	}
};

// queue is instance of MockQueue
MockRouter.prototype.addQueue = function(queue) {
	var that = this;
	var queuesWithSameName = _.filter(that._allQueues, function(q) {
		return q.name === queue.name;
	});

	if (queue.options.passive) {
		if (queuesWithSameName.length === 0) {
			var e = {
				code : 404
			};
			throw e;
		}
	}

	if (queue.options.exclusive) {
		var queueWithOtherConnection = _.find(queuesWithSameName, function(q) {
			return q._connection !== queue._connection;
		});

		if (queueWithOtherConnection) {
			//TODO determine proper error code
			var e = {
				message : "Exclusive queue opened on other connection",
				code : -1
			};
			throw e;
		}
	}

	that._allQueues.push(queue);
};

MockRouter.prototype.removeQueue = function(queue) {
	var that = this;
	var idx = that._allQueues.indexOf(queue);
	if (idx > -1) {
		that._allExchanges.splice(idx, 1);
	}
};

MockRouter.prototype.exchangeExists = function(exchangeName) {
	return !!_.findWhere(this._allExchanges, {
		name : exchangeName
	});
};

module.exports = MockRouter;