var testUtils = require("./support.js");
var _ = require("underscore");
var Q = require("q");

describe("mockAmqp", function() {

	var mockAmqp;

	beforeEach(function() {
		mockAmqp = require("../mockAmqp.js");
	});

	it("should create the default exchanges afer reset", function(done) {
		mockAmqp.reset().then(function() {
			var connection = mockAmqp.createConnection({
				host : "foo"
			}, {
				reconnect : false
			}, function() {

				var getDefaultExchange = function(exchangeName) {
					var defer = Q.defer();
					var default1 = connection.exchange(exchangeName, {
						passive : true
					}, defer.resolve);
					return defer.promise;
				};

				var promises = [];
				promises.push(getDefaultExchange("")); // the default
				promises.push(getDefaultExchange("amq.direct"));
				promises.push(getDefaultExchange("amq.fanout"));
				promises.push(getDefaultExchange("amq.headers"));
				promises.push(getDefaultExchange("amq.match"));
				promises.push(getDefaultExchange("amq.rabbitmq.log"));
				promises.push(getDefaultExchange("amq.rabbitmq.trace"));
				promises.push(getDefaultExchange("amq.topic"));
				Q.all(promises).then(function() {
					done();
				}, done);
			});
			expect(connection).to.be.ok;
		});

	});

	context("connection", function() {

		it("should create a connection with createConnection function", function(done) {
			var connection = mockAmqp.createConnection({
				host : "foo"
			}, {
				reconnect : false
			}, function() {
				done();
			});
			expect(connection).to.be.ok;
		});

		context("constructor", function() {

			it("should handle optional options", function() {
				var defers = [ Q.defer(), Q.defer() ];

				var connection = mockAmqp.createConnection({
					host : "foo"
				}, null, function() {
					defers[0].resolve();
				});
				expect(connection).to.be.ok;
				expect(connection.options).to.be.ok;
				expect(connection.options.host).to.equal("foo");
				expect(connection.implOptions).to.be.ok;

				connection = mockAmqp.createConnection(null, {
					reconnect : false
				}, function() {
					defers[1].resolve();
				});
				expect(connection).to.be.ok;
				expect(connection.options).to.be.ok;
				expect(connection.implOptions).to.be.ok;

				return Q.all(_.pluck(defers, "promise")).timeout(10, "TIMEOUT");
			});

			it("should handle optional impl options", function() {
				var defers = [ Q.defer(), Q.defer() ];

				var connection = mockAmqp.createConnection(null, {
					reconnect : false
				}, function() {
					defers[0].resolve();
				});

				expect(connection).to.be.ok;
				expect(connection.options).to.be.ok;
				expect(connection.implOptions).to.be.ok;
				expect(connection.implOptions.reconnect).to.equal(false);
				connection = mockAmqp.createConnection(null, null, function() {
					defers[1].resolve();
				});
				expect(connection).to.be.ok;
				expect(connection.options).to.be.ok;
				expect(connection.implOptions).to.be.ok;

				return Q.all(_.pluck(defers, "promise")).timeout(10, "TIMEOUT");
			});
		});

		it("should fire ready when the connection is opened", function() {
			var connection = mockAmqp.createConnection();
			var defer = Q.defer();
			connection.on("ready", function() {
				defer.resolve();
			});
			return defer.promise;
		});

		it("should publish to the default exchange with the given routing key");
	});

});