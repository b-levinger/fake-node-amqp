'use strict';
var Q = require("q");
var _ = require("underscore");
var events = require('events');
var util = require("util");
var MockBindable = require("./MockBindable.js");

var MockExchange = function(connection, mockRouter, name, options, openCallback) {
	this._mockRouter = mockRouter;
	MockBindable.apply(this);
	var that = this;
	this.mockCreatedWithArgs = arguments;

	this._connection = connection;
	this.name = name;
	this.options = _.defaults(options || {}, {
		type : 'topic',
		autoDelete : true
	});
	this._type = this.options.type.toLowerCase();
	this._openCallback = openCallback;

	Q.delay(1).then(function() {
		that.mockTriggerOpen();
	});

};

util.inherits(MockExchange, events.EventEmitter);

_.each(_.keys(MockBindable.prototype), function(m) {
	MockExchange.prototype[m] = MockBindable.prototype[m];
});

MockExchange.prototype.mockDataRecieved = function(data, routingKey, options) {
	this.emit("MOCK_PUBLISH_DATA", this._type, data, routingKey, options);
};

MockExchange.prototype.mockTriggerOnBind = function(exchangeName, callback) {
	if (callback) {
		callback(this);
	}
};

MockExchange.prototype.mockTriggerOpen = function() {
	var that = this;
	try {
		that._mockRouter.addExchange(this);
		that.emit("open");
		if (this._openCallback) {
			this._openCallback(this);
		}
	} catch (e) {
		this.emit("error", e);
	}

};

MockExchange.prototype.publish = function(routingKey, message, options, callback) {
	this.emit("MOCK_PUBLISH_DATA", this._type, message, routingKey, options);
	if (this.options.confirm) {
		if (callback) {
			this.mockPublishCallback(callback);
		}
	}
};

MockExchange.prototype.mockPublishCallback = function(callback) {
	if (callback) {
		callback(true);
	}
};

MockExchange.prototype.destroy = function(ifUnused) {
	//TODO implement ifUnused portion
	this._destroyed = true;
	var that = this;
	Q.delay(1).then(function() {
		that._mockRouter.removeExchange(that);
		that.emit("close");
	});
};

module.exports = MockExchange;