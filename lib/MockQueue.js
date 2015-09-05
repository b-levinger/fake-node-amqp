'use strict';
var Q = require("q");
var _ = require("underscore");
var events = require('events');
var util = require("util");
var MockExchange = require("./MockExchange.js");
var MockBindable = require("./MockBindable.js");
var Promise = require("amqp/lib/promise").Promise;

var MockQueue = function(connection, mockRouter, name, options, openCallback) {
	this._mockRouter = mockRouter;
	var that = this;

	this.mockCreatedWithArgs = arguments;
	this._events = new events.EventEmitter();

	this._connection = connection;
	this.name = name;
	this.options = options;
	this._openCallback = openCallback;

	this._subscribesByTag = {};

	this._acknowledgeObj = {
		acknowledge : function() {
		}
	}

	Q.delay(1).then(function() {
		that.mockTriggerOpen();
	});

};

util.inherits(MockQueue, MockBindable);

MockQueue.prototype.emit = function() {
	this._events.emit.apply(this._events, arguments);
};

MockQueue.prototype.mockDataReceived = function(data, routingKey, options, exchange) {
	options = options || {};
	var that = this;
	_.keys(this._subscribesByTag, function(consumerTag) {
		var deliveryInfo = {};
		deliveryInfo.queue = that.name;
		deliveryInfo.deliveryTag = "random-deliver-tag:" + Math.random();
		deliveryInfo.redelivered = false;
		deliveryInfo.exchange = exchange.name;
		deliveryInfo.routingKey = routingKey;
		deliveryInfo.consumerTag = consumerTag;
		that._events.emit("MOCK_DATA:" + consumerTag, data, options.headers || {}, deliveryInfo, that._acknowledgeObj);
	});
};

MockQueue.prototype.mockTriggerOnBind = function(exchangeName, callback) {
	this._events.emit("queueBindOk");
	if (callback) {
		callback(this);
	}
};

MockQueue.prototype.mockTriggerOpen = function() {
	try {
		this._mockRouter.addQueue(this);
		this._events.emit("open");
		if (this._openCallback) {
			this._openCallback(this);
		}
	} catch (e) {
		this._events.emit("error", e);
	}
};

MockQueue.prototype.on = function(evt, callback) {
	this._events.on(evt, callback);
};
MockQueue.prototype.subscribe = function(options, listener) {
	var that = this;
	// Optional options
	if (typeof options === "function") {
		listener = options;
		options = {};
	}

	options = _.defaults(options || {}, {
		ack : false
	});

	var promise = new Promise();
	var consumerTag = 'node-amqp-' + process.pid + '-' + Math.random();
	this._subscribesByTag[consumerTag] = {
		promise : promise,
		listener : listener
	};
	this._events.on("MOCK_DATA:" + consumerTag, listener);
	Q.delay(1).then(function() {
		that.mockSubscribeComplete(promise, consumerTag);
	})
	return promise;
};

MockQueue.prototype.mockSubscribeComplete = function(promise, consumerTag) {
	this._events.emit("basicQosOk");
	promise.emitSuccess({
		consumerTag : consumerTag
	});
}

MockQueue.prototype.subscribeRaw = function(/* [options,] */listener) {
	throw new Error("NOT MOCKED");
};

MockQueue.prototype.unsubscribe = function(consumerTag) {
	var that = this;
	if (!this._subscribesByTag[consumerTag]) {
		var listener = this._subscribesByTag[consumerTag].listener;
		that.removeListener("MOCK_DATA:" + consumerTag, listener);
	}
	delete this._subscribesByTag[consumerTag];

	var promise = new Promise();
	Q.delay(1).then(function() {
		that.mockUnsubscribeComplete(promise, consumerTag);
	});
	return promise;
};

MockQueue.prototype.mockUnsubscribeComplete = function(promise, consumerTag) {
	promise.emitSuccess({
		consumerTag : consumerTag
	});
};

MockQueue.prototype.removeListener = function(evt, listener) {
	this._events.removeListener(evt, listener);
};

MockQueue.prototype.shift = function(/* [reject [, requeue]] */) {
	throw new Error("NOT MOCKED");
};

MockQueue.prototype.destroy = function(options) {
	//TODO check options for ifUnused / ifEmpty and handle accordingly
	var that = this;
	Q.delay(1).then(function() {
		that._mockRouter.unbindObjAll(that);
		that._mockRouter.removeQueue(that);
		that.emit("close");
	});
};

module.exports = MockQueue;