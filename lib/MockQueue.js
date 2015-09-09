'use strict';
var Q = require("q");
var _ = require("underscore");
var events = require('events');
var util = require("util");
var MockExchange = require("./MockExchange.js");
var MockBindable = require("./MockBindable.js");
var Promise = require("amqp/lib/promise").Promise;
var debug = require("debug")("fake-amqp");

var MockQueue = function(connection, mockRouter, name, options, openCallback) {
	this._mockRouter = mockRouter;
	var that = this;
	this._isQueue = true;
	this.mockCreatedWithArgs = arguments;
	this._events = new events.EventEmitter();

	this._connection = connection;
	this.name = name;

	this.options = {
		autoDelete : true,
		closeChannelOnUnsubscribe : false
	};
	_.extend(this.options, options || {});

	this._openCallback = openCallback;

	this._subscribesByTag = {};

	this._acknowledgeObj = {
		acknowledge : function() {}
	}

	Q.delay(1).then(function() {
		that.mockTriggerOpen();
	}).fail(function(err) {
		debug("queue %s: emitting error:\n%s", that.name, err.stack);
		that._events.emit("error", err);
	});

};

util.inherits(MockQueue, MockBindable);

MockQueue.prototype.emit = function() {
	this._events.emit.apply(this._events, arguments);
};

MockQueue.prototype.mockTriggerOnBind = function(exchangeName, callback) {
	if (exchangeName) {
		debug("queue %s: emitting queueBindOk", this.name);
		this._events.emit("queueBindOk");
		if (callback) {
			callback(this);
		}
	}
};

MockQueue.prototype.mockTriggerOpen = function() {
	this._mockRouter.addQueue(this);
	this.bind("", this.name);
	debug("queue %s: emitting open", this.name);
	this._events.emit("open");
	if (this._openCallback) {
		this._openCallback(this);
	}
};

MockQueue.prototype.on = function(evt, callback) {
	this._events.on(evt, callback);
};
MockQueue.prototype.subscribe = function(options, listener) {
	var that = this;
	var p = this.subscribeRaw(options, listener);
	p.addCallback(function() {
		// basicQosOk is no longer being emitted from the amqp library bug?
//		debug("queue %s: emitting basicQosOk", that.name);
//		that._events.emit("basicQosOk");
	});
	return p;
};

MockQueue.prototype.subscribeRaw = function(options, listener) {
	try {
		var that = this;
		// Optional options
		if (typeof options === "function") {
			listener = options;
			options = {};
		}

		options = _.defaults(options || {}, {
			ack : false
		});
		var p;
		p = this._mockRouter.subscribe(this, options, listener);
		p.addCallback(function() {
			debug("queue %s: emitting basicConsumeOk", that.name);
			that._events.emit("basicConsumeOk");
		});
	} catch (err) {
		debug("queue %s: emitting error:\n%s", this.name, err.stack);
		this._events.emit("error", err);
		p = new Promise();
	}
	return p;
};

MockQueue.prototype.unsubscribe = function(consumerTag) {
	var that = this;
	try {
		return this._mockRouter.unsubscribe(this, consumerTag).addCallback(function() {
			debug("queue %s: emitting basicCancelOk", that.name);
			that._events.emit("basicCancelOk");
		});
	} catch (err) {
		debug("queue %s: emitting error:\n%s", this.name, err.stack);
		this._events.emit("error", err);
	}
};

MockQueue.prototype.removeListener = function(evt, listener) {
	this._events.removeListener(evt, listener);
};

MockQueue.prototype.shift = function(/* [reject [, requeue]] */) {
	throw new Error("NOT MOCKED");
};

MockQueue.prototype.destroy = function(options) {
	//TODO check options for ifUnused / ifEmpty and handle accordingly
	this._destroyed = true;
	var that = this;
	Q.delay(1).then(function() {
		that._mockRouter.unbindObjAll(that);
		that._mockRouter.removeQueue(that);
		debug("queue %s: emitting close", that.name);
		that.emit("close");
	});
};

module.exports = MockQueue;