'use strict';
var Q = require("q");
var debug = require("debug")("fake-amqp");
var _ = require("underscore");
var events = require('events');
var util = require("util");

//This class expects the inheriter to implement mockTriggerOnBind, and mockDataReceived and _mockRouter to be defined
var MockBindable = function() {

};

MockBindable.prototype.bind = function(exchange, routingKey, callback) {
	// The first argument, exchange is optional.
	// If not supplied the connection will use the 'amq.topic'
	// exchange.
	var that = this;
	if (routingKey === undefined || _.isFunction(routingKey)) {
		callback = routingKey;
		routingKey = exchange;
		exchange = 'amq.topic';
	}

	if (!_.isFunction(callback)) {
		callback = null;
	}

	var exchangeName = exchange.name ? exchange.name : exchange;

	Q.delay(1).then(function() {
		that.triggerMockBind(exchangeName, routingKey, callback);
	}).fail(function(err) {
		debug("queue %s emitting error\n%s", that.name, err.stack);
		that.emit("error", err);
		debug(err.stack);
	});
};

MockBindable.prototype.triggerMockBind = function(exchangeName, routingKey, callback) {
	this._mockRouter.bindObj(this, exchangeName, routingKey);
	this.mockTriggerOnBind(exchangeName, callback);
};

MockBindable.prototype.unbind = function(exchange, routingKey) {
	// The first argument, exchange is optional.
	// If not supplied the connection will use the default 'amq.topic'
	// exchange.
	if (routingKey === undefined) {
		routingKey = exchange;
		exchange = 'amq.topic';
	}

	try {
		var exchangeName = exchange && exchange.name ? exchange.name : exchange;
		this._mockRouter.unbindObjFrom(this, exchangeName, routingKey);

		if (this._isQueue) {
			debug("queue %s emitting queueUnbindOk", this.name);
			this.emit("queueUnbindOk");
		} else {
			debug("exchange %s emitting exchangeUnbindOk", this.name);
			this.emit("exchangeUnbindOk");
		}
	} catch (e) {
		debug(e.stack);
	}
};

MockBindable.prototype.bind_headers = function(exchange, routing) {
	throw new Error("NOT MOCKED");
};

MockBindable.prototype.unbind_headers = function(exchange, routing) {
	throw new Error("NOT MOCKED");
};

module.exports = MockBindable;