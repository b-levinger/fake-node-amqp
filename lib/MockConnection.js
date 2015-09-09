'use strict';
var Q = require("q");
var _ = require("underscore");
var events = require('events');
var util = require("util");
var MockExchange = require("./MockExchange.js");
var MockQueue = require("./MockQueue.js");
var MockRouter = require("./MockRouter.js");
var debug = require("debug")("fake-amqp");

var defaultPorts = {
	'amqp' : 5672,
	'amqps' : 5671
};

var defaultOptions = {
	host : 'localhost',
	port : defaultPorts['amqp'],
	login : 'guest',
	password : 'guest',
	authMechanism : 'AMQPLAIN',
	vhost : '/',
	connectionTimeout : 10000,
	ssl : {
		enabled : false
	}
};

var defaultSslOptions = {
	port : defaultPorts['amqps'],
	ssl : {
		rejectUnauthorized : true
	}
};

var defaultImplOptions = {
	defaultExchangeName : '',
	reconnect : true,
	reconnectBackoffStrategy : 'linear',
	reconnectExponentialLimit : 120000,
	reconnectBackoffTime : 1000
};

var defaultClientProperties = {
	version : "x.x",
	platform : 'node-' + process.version,
	product : 'node-amqp'
};

var mockRouter;
var allConnections = [];

var MockConnection = function(connectionArgs, options, readyCallback) {
	this.mockCreatedWithArgs = arguments;
	this._createdExchanges = [];
	this._createdQueues = [];
	this.setOptions(connectionArgs);
	this.setImplOptions(options);
	this._readyCallback = readyCallback;
	allConnections.push(this);
};

util.inherits(MockConnection, events.EventEmitter);

MockConnection.MOCK_BUILD_DEFAULT_EXCHANGES = function() {
	debug("connection: creating default exchanges");
	var createDefaultExchange = function(exchangeName, type) {
		var defer = Q.defer();
		try {
			var exchange = new MockExchange(null, mockRouter, exchangeName, {
				type : type,
				_default : true
			}, defer.resolve);
			exchange.on("error", defer.reject);
		} catch (e) {
			defer.reject(e);
		}
		return defer.promise;
	};

	var promises = [];
	promises.push(createDefaultExchange("", "direct")); // the default
	promises.push(createDefaultExchange("amq.direct", "direct"));
	promises.push(createDefaultExchange("amq.fanout", "fanout"));
	promises.push(createDefaultExchange("amq.headers", "headers"));
	promises.push(createDefaultExchange("amq.match", "headers"));
	promises.push(createDefaultExchange("amq.rabbitmq.log", "topic"));
	promises.push(createDefaultExchange("amq.rabbitmq.trace", "topic"));
	promises.push(createDefaultExchange("amq.topic", "topic"));

	return Q.delay(1).then(function() {
		return Q.all(promises);
	}).fail(function(err) {
		debug(err.stack);
		return Q.reject(err);
	});
};

MockConnection.MOCK_RESET = function() {
	mockRouter = new MockRouter();
	_.each(allConnections, function(con) {
		con.disconnect();
	});
	allConnections = [];
	return MockConnection.MOCK_BUILD_DEFAULT_EXCHANGES();
};

MockConnection.MOCK_RESET();

MockConnection.prototype.setOptions = function(options) {
	var urlo = (options && options.url) ? this._parseURLOptions(options.url) : {};
	var sslo = (options && options.ssl && options.ssl.enabled) ? defaultSslOptions : {};
	this.options = _.extend({}, defaultOptions, sslo, urlo, options || {});
	this.options.clientProperties = _.extend({}, defaultClientProperties, (options && options.clientProperties) || {});
};

MockConnection.prototype.setImplOptions = function(options) {
	this.implOptions = _.extend({}, defaultImplOptions, options || {});
};

MockConnection.prototype.connect = function() {
	var that = this;
	this._connected = true;
	Q.delay(1).then(function() {
		that.mockTriggerReady();
	});
};

MockConnection.prototype.disconnect = function() {
	var that = this;
	if (!this._connected) {
		return;
	}
	this._connected = false;
	Q.delay(1).then(function() {
		debug("connection: emitting close");
		that.emit("close");
	});
};

MockConnection.prototype.mockTriggerReady = function() {
	debug("connection: emitting ready");
	this.emit('ready');
	if (this._readyCallback) {
		this._readyCallback(this);
	}
};

MockConnection.prototype.publish = function(routingKey, body, options, callback) {
//TODO implement
};

MockConnection.prototype.exchange = function(name, options, openCallback) {
	var exchange = new MockExchange(this, mockRouter, name, options, openCallback);
	this._createdExchanges.push(exchange);
	return exchange;
}

MockConnection.prototype.queue = function(name, options, openCallback) {
	var options, callback;
	if (typeof arguments[1] == 'object') {
		options = arguments[1];
		callback = arguments[2];
	} else {
		callback = arguments[1];
	}
	var queue = new MockQueue(this, mockRouter, name, options, callback);
	this._createdQueues.push(queue);
	return queue;
}

MockConnection.prototype.getCreatedMockExchanges = function() {
	return this._createdExchanges;
};

MockConnection.prototype.getCreatedMockQueues = function() {
	return this._createdQueues;
};

module.exports = MockConnection;