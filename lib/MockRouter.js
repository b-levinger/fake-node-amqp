'use strict';
var Q = require("q");
var _ = require("underscore");
var MockQueue = require("./MockQueue.js");
var MockExchange = require("./MockExchange.js");
var Promise = require("amqp/lib/promise").Promise;
var debug = require("debug")("fake-amqp");

var MockRouter = function() {
	this._bindings = [];
	this._allExchanges = [];
	this._allQueues = [];

	this._subscribers = [];
};

MockRouter.prototype.reset = function() {
	var that = this;
	_.each(that._allExchanges, function(exchange) {
		exchange.removeAllListeners("MOCK_BROADCAST_DATA");
		exchange.removeAllListeners("MOCK_BROADCAST_DATA");
	});

	_.each(that._allExchanges, function(ex) {
		if (!ex._destroyed) {
			ex.emit("close");
		}
	});

	_.each(that._allQueues, function(q) {
		if (!q._destroyed) {
			q._events.emit("close");
		}
	});

	that._bindings = [];
	that._allExchanges = [];
	that._allQueues = [];
	that._subscribers = [];
};

// checks if the queue should really exist
MockRouter.prototype._queueReallyDeclared = function(qName) {
	return !!_.find(this._allQueues, function(q) {
		return q.name === qName && !q.options.noDeclare && !q._destroyed;
	});
};

//checks if the queue should really exist
MockRouter.prototype._exchangeReallyDeclared = function(excName) {
	return !!_.find(this._allExchanges, function(exc) {
		return exc.name === excName && !exc.options.noDeclare && !exc._destroyed;
	});
};

MockRouter.prototype.subscribe = function(queue, options, fnListener) {
	debug("subscribing %s to listener with options %j", queue.name, options);
	var that = this;
	if (!this._queueReallyDeclared(queue.name)) {
		throw {
			message : "Error: NOT_FOUND - no queue '" + queue.name + "' in vhost '/'",
			code : 404
		};
	}

	//TODO check options.exclusive

	var subsByQueue = _.find(that._subscribers, function(q) {
		return queue.name === q.name;
	});
	if (!subsByQueue) {
		subsByQueue = {
			name : queue.name,
			subscribers : []
		};
		that._subscribers.push(subsByQueue);
	}

	var promise = new Promise();
	var consumerTag = 'node-amqp-' + process.pid + '-' + Math.random();

	Q.delay(1).then(function() {
		subsByQueue.subscribers.push({
			listener : fnListener,
			tag : consumerTag,
			obj : queue,
			lastCalled : subsByQueue.subscribers.length
		});
		promise.emitSuccess({
			consumerTag : consumerTag
		});
	}).fail(function(e) {
		debug(e.stack);
	});
	return promise;
};

MockRouter.prototype.unsubscribe = function(queue, consumerTag) {
	debug("unsubscribing consumer %s from %s", consumerTag, queue.name);
	var that = this;
	var promise = new Promise();
	Q.delay(1).then(function() {
		var subsByQueue = _.find(that._subscribers, function(q) {
			return queue.name === q.name;
		});

		if (queue.options.closeChannelOnUnsubscribe) {

			var subsToUnsub = _.findWhere(subsByQueue.subscribers, function(s) {
				return s.obj === queue;
			});

			_.each(subsToUnsub, function(sub) {
				if (sub.obj === queue) {
					var idx = subsByQueue.subscribers.indexOf(sub);
					// get rid of the subscriber
					subsByQueue.subscribers.splice(idx, 1);
				}
			});
			queue._events.emit("close");
			queue._destroyed = true;
		} else {
			var subObj = _.find(subsByQueue.subscribers, function(s) {
				return s.obj === queue && s.tag === consumerTag;
			});
			if (subObj) {
				var idx = subsByQueue.subscribers.indexOf(subObj);
				// get rid of the subscriber
				subsByQueue.subscribers.splice(idx, 1);
			}

			if (queue.options.autoDelete) {
				var remaining = _.find(subsByQueue, function(q) {
					q.obj === queue
				});
				if (!remaining) {
					queue._destroyed = true;
				}
			}
		}

		promise.emitSuccess({
			consumerTag : consumerTag
		});
	}).fail(function(err) {
		debug(err.stack);
	});
	return promise;
};

// obj is instance of MockBindable
MockRouter.prototype.bindObj = function(obj, exchangeName, routingKey) {
	var that = this;

	if (exchangeName === "" && routingKey === "") {
		debug("binding %s to default exchange failed with 403", obj.name);
		throw {
			message : "Error: ACCESS_REFUSED - operation not permitted on the default exchange",
			code : 403
		};
	}

	if (exchangeName && !this.exchangeExists(exchangeName)) {
		debug("binding %s to %s failed with 404 on exchange %s", obj.name, exchangeName, exchangeName);
		throw {
			message : "Error: NOT_FOUND - no exchange '" + exchangeName + "' in vhost '/'",
			code : 404
		};
	}

	if (obj instanceof MockQueue) {
		// ensure it's open
		if (!this._queueReallyDeclared(obj.name)) {
			debug("binding %s to %s failed with 404 on queue %s", obj.name, exchangeName, obj.name);
			throw {
				message : "Error: NOT_FOUND - no queue '" + obj.name + "' in vhost '/'",
				code : 404
			};
		}
	} else if (obj instanceof MockExchange) {
		// ensure it's open
		if (!this._exchangeReallyDeclared(obj.name)) {
			debug("binding %s to %s failed with 404 on destination exchange %s", obj.name, exchangeName, obj.name);
			throw {
				message : "Error: NOT_FOUND - no exchange '" + exchangeName + "' in vhost '/'",
				code : 404
			};
		}
	}

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

MockRouter.prototype._sendDataToSubscribers = function(bindings, data, routingKey, options, exchange) {
	var that = this;
	var uniqueBindings = _.uniq(bindings);
	options = options || {};

	var allSubscribersByObject = _.map(uniqueBindings, function(b) {
		var subscriberObjName = _.find(that._subscribers, function(s) {
			return s.name === b.obj.name
		});
		if (!subscriberObjName) {
			return null;
		}
		return _.sortBy(subscriberObjName.subscribers, "lastCalled")[0];
	});

	_.each(allSubscribersByObject, function(subscribeObj) {
		try {
			var deliveryInfo = {};
			deliveryInfo.queue = subscribeObj.obj.name;
			deliveryInfo.deliveryTag = "random-deliver-tag:" + Math.random();
			deliveryInfo.redelivered = false;
			deliveryInfo.exchange = exchange.name;
			deliveryInfo.routingKey = routingKey;
			deliveryInfo.consumerTag = subscribeObj.tag;

			debug("sending data to: '%s' consumerTag: '%s' with routingKey '%s' from exchange '%s'", subscribeObj.obj.name, subscribeObj.tag, routingKey, exchange.name, data);

			var acknowledgeObj = {
				acknowledge : function() {
					debug("ack");
				}
			};
			subscribeObj.lastCalled = Date.now();
			subscribeObj.listener(data, options.headers || {}, deliveryInfo, acknowledgeObj);
		} catch (err) {
			debug(err.stack);
		}

	});
};

MockRouter.prototype._publishFanout = function(exchange, data, routingKey, options) {
	debug("fanout exchange '%s' publishing with routingKey '%s': data %j", exchange.name, routingKey, data);
	var that = this;
	var bindings = _.filter(that._bindings, function(binding) {
		return binding.exchangeName === exchange.name;
	});

	// remove dupes
	bindings = _.unique(bindings, function(binding) {
		return binding.obj;
	});

	that._sendDataToSubscribers(bindings, data, routingKey, options, exchange)
};

MockRouter.prototype._publishDirect = function(exchange, data, routingKey, options) {
	debug("direct exchange '%s' publishing with routingKey '%s': data %j", exchange.name, routingKey, data);
	var that = this;
	var bindings = _.filter(that._bindings, function(binding) {
		return binding.exchangeName === exchange.name && binding.routingKey === routingKey;
	});

	// remove dupes
	bindings = _.unique(bindings, function(binding) {
		return binding.obj;
	});

	that._sendDataToSubscribers(bindings, data, routingKey, options, exchange)
};

MockRouter.prototype._publishTopic = function(exchange, data, routingKey, options) {
	debug("topic exchange '%s' publishing with routingKey '%s': data %j", exchange.name, routingKey, data);
	var that = this;
	var bindings = _.filter(that._bindings, function(binding) {
		return binding.exchangeName === exchange.name && (routingKey === binding.routingKey || routingKey && routingKey.match && routingKey.match(binding.routingRgx));
	});

	// remove dupes
	bindings = _.unique(bindings, function(binding) {
		return binding.obj;
	});

	that._sendDataToSubscribers(bindings, data, routingKey, options, exchange)
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
				message : "Error: NOT_FOUND - no exchange '" + exchange.name + "' in vhost '/'",
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
				message : "Error: NOT_FOUND - no queue '" + queue.name + "' in vhost '/'",
				code : 404
			};
			throw e;
		}
	}

	var previousExclusiveQueue = _.find(queuesWithSameName, function(q) {
		return !!q.options.exclusive && !q.options.noDeclare && !q._destroyed;
	});

	if (previousExclusiveQueue) {
		var e = {
			message : "Error: ACCESS_REFUSED - queue '" + queue.name + "' in vhost '/' in exclusive use",
			code : 403
		};
		throw e;
	}

	var previousNonExclusiveQueue = _.find(queuesWithSameName, function(q) {
		return !q.options.exclusive && !q._destroyed;
	});

	if (queue.options.exclusive) {
		if (previousNonExclusiveQueue) {
			var e = {
				message : "Error: RESOURCE_LOCKED - cannot obtain exclusive access to locked queue '" + queue.name + "' in vhost '/'",
				code : 405
			};
			throw e;
		}
	}

	if (previousNonExclusiveQueue) {
		var prevOptions = previousNonExclusiveQueue.options;
		if (prevOptions.durable != queue.options.durable || prevOptions.autoDelete != queue.options.autoDelete) {
			var e = {
				message : "Error: PRECONDITION_FAILED - parameters for queue '" + queue.name + "' in vhost '/' not equivalent",
				code : 406
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