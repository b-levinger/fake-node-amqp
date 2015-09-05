var testUtils = require("./support.js");
var _ = require("underscore");
var Q = require("q");

describe("Queues", function() {
	var mockAmqp;
	var connection;

	beforeEach(function(done) {
		mockAmqp = require("../mockAmqp.js");
		connection = mockAmqp.createConnection(null, null, function() {
			done();
		});
	});

	it("when passive option is true it should error if the queue already exists with code 404", function(done) {
		var q1 = connection.queue("testQueue", {
			passive : true
		}, function() {
			done(new Error("passive queue should not have opened"));
		});
		q1.on("error", function(err) {
			if (err.code === 404) {
				done();
			} else {
				done(new Error("expected 404 code"));
			}
		});
	});
	it("when passive option is true it should not error if the queue does exist", function(done) {
		var q1 = connection.queue("testQueue", {}, function() {
			var q2 = connection.queue("testQueue", {
				passive : true
			}, function() {
				done();
			});
			q2.on("error", function(err) {
				done(err);
			});
		});
	});

	it("when exclusive option is true it should error if the queue already exists on another connection with code ?", function(done) {
		var connection2 = mockAmqp.createConnection(null, null, function() {
			var q1 = connection2.queue("testQueue", {
				exclusive : true
			}, function() {
				var q2 = connection.queue("testQueue", {
					exclusive : true
				}, function() {
					done(new Error("exclusive queue should not have been opened"));
				});
				q2.on("error", function(err) {
					done();
				});
			});
			q1.on("error", done);
		});
	});

	it("when exclusive option is true it should not error if the queue already exists on the same connection", function(done) {
		var connection2 = mockAmqp.createConnection(null, null, function() {
			var q1 = connection2.queue("testQueue1", {
				exclusive : true
			}, function() {
				var q2 = connection.queue("testQueue2", {
					exclusive : true
				}, function() {
					done();
				});
			});
			q1.on("error", done);
		});
	});

	context("binding", function() {

		it("should accept exchange objects as the first parameter", function(done) {
			var exchange = connection.exchange("testExchange", {}, function() {
				var q = connection.queue("testQueue", {}, function() {
					var spy = testUtils.spy(q, "triggerMockBind");
					q.bind(exchange, "", function() {
						expect(spy).to.have.been.calledWith("testExchange");
						done();
					});
				});
				q.on("error", done);
			});
			exchange.on("error", done);
		});

		it("should accept exchange name as teh first parameter", function(done) {
			var exchange = connection.exchange("testExchange", {}, function() {
				var q = connection.queue("testQueue", {}, function() {
					var spy = testUtils.spy(q, "triggerMockBind");
					q.bind("testExchange", "", function() {
						expect(spy).to.have.been.calledWith("testExchange");
						done();
					});
				});
				q.on("error", done);
			});
			exchange.on("error", done);
		});

		it("should bind to amq.topic if no exchange is specified", function(done) {
			var q = connection.queue("", {}, function() {
				var spy = testUtils.spy(q, "triggerMockBind");
				q.bind("", function() {
					expect(spy).to.have.been.calledWith("amq.topic");
					done();
				});
			});
			q.on("error", done);
		});

		it("should emit queueBindOk", function(done) {
			var exchange = connection.exchange("testExchange", {}, function() {
				var q = connection.queue("testQueue", {}, function() {
					q.bind("testExchange")
				});
				q.on("error", done);
				q.on("queueBindOk", function() {
					done();
				});
			});
			exchange.on("error", done);
		});

		it("should emit error with 404 if the exchange doesnt exist", function(done) {
			var q = connection.queue("", {}, function() {
				var spy = testUtils.spy(q, "triggerMockBind");
				q.bind("someNotFoundExchange", "", function() {
					done(new Error("queue should not have been able to bind"));
				});
			});
			q.on("error", function(err) {
				expect(err.code).to.equal(404);
				done();
			});
		});

	});

	context("subscribe", function() {

		it("should emit message event for each subscriber consumerTag");

		it("should emit data from a bound exchange to the subscribers");

		it("should return a promise with the consumer tag");

	});

	context("unsubscribe", function() {

		it("should return a promise");

		it("should allow unsubscribe by contentTags, and no longer send data from bound exchanges to those listeners");
	});

});