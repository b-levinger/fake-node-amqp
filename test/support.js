var sinon = require("sinon");
var Q = require("q");
Q.longStackSupport = true;
var chai = require('chai');
var sinonChai = require("sinon-chai");
var _ = require("underscore");

var mockAmqp = require("../mockAmqp.js");

chai.use(sinonChai);
global.expect = chai.expect;
chai.config.includeStack = true;

var sinonSandbox;

beforeEach(function() {
	mockAmqp.reset();
	if (sinonSandbox) {
		sinonSandbox.restore();
	}
	sinonSandbox = sinon.sandbox.create();
});

exports.spy = function() {
	return sinonSandbox.spy.apply(sinonSandbox, arguments);
};

exports.stub = function() {
	return sinonSandbox.stub.apply(sinonSandbox, arguments);
};

exports.mock = function() {
	return sinonSandbox.mock.apply(sinonSandbox, arguments);
};

exports.matcher = function() {
	return sinon.matcher.appyly(sinon.matcher, arguments);
};

exports.match = sinon.match;

exports.createAndBindQueue = function(name, options, routingKey, connection, exchange) {
	return Q.fcall(function() {
		var defer = Q.defer();
		var queue = connection.queue(name, options, function() {
			queue.bind(exchange, routingKey, function() {
				defer.resolve(queue);
			});
		});
		queue.on("error", defer.reject);
		return defer.promise.timeout(25, new Error("TIMEDOUT"));
	});
};