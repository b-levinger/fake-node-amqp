var testUtils = require("./support.js");
var _ = require("underscore");
var Q = require("q");

describe("Exchanges", function() {
	var mockAmqp;
	var connection;
	var testerObj;

	beforeEach(function(done) {
		mockAmqp = require("../fakeAmqp.js");
		testerObj = {
			cb1 : function() {
			},
			cb2 : function() {
			},
			cb3 : function() {
			}
		};
		connection = mockAmqp.createConnection(null, null, function() {
			done();
		});
	});

	it("should call the callback when opened", function(done) {
		connection.exchange("testExchange", null, function() {
			done();
		});
	});

	it("should emit open when opened", function(done) {
		var exc = connection.exchange("testExchange");
		exc.on("open", function() {
			done();
		});
		exc.on("error", done);
	});

	context("when passive option is true", function() {

		it("it should error if the exchange doesnt already exists with code 404", function(done) {
			var exc1 = connection.exchange("testExchange", {
				passive : true
			}, function() {
				done(new Error("passive exchange should not have opened"));
			});
			exc1.on("error", function(err) {
				if (err.code === 404) {
					done();
				}
			});
		});

		it("it should not error if the exchange does exist", function(done) {
			var exc1 = connection.exchange("testExchange", {}, function() {
				var exc2 = connection.exchange("testExchange", {
					passive : true
				}, function() {
					done();
				});
				exc2.on("error", function(err) {
					done(err);
				});
			});
			exc1.on("error", done);
		});
	});

	context("when autoDelete option is true", function() {

		it("should self destruct but only after the first queue has bound to it and all queues have unbound");

	});

	context("when noDeclare option is true", function() {

		it("should fake the create but continue to work if the exchang really does exist");

		context("and it doesnt really exist", function() {

			//			Error: NOT_FOUND - no exchange 'myExchange3' in vhost '/'

			it("should error with 404 when publish is called");

			it("should error with 404 when bind is called");

			it("should succeed when unbind is called");

			it("should not error when destroy is called");

		});

	});

	context("when confirm option is true", function() {

		it("should emit an ack event on publish");

	});

	context("of type fanout", function() {
		var excFanout;
		beforeEach(function(done) {
			excFanout = connection.exchange("testExchange", {
				type : "fanout"
			}, function() {
				done();
			});
			excFanout.on("error", done);
			expect(excFanout).to.be.ok;
			expect(excFanout.options).to.be.ok;
			expect(excFanout.options.type).to.equal("fanout");
		});

		it("should ignore routing key and publish to all bound subscribers", function() {
			var q1Promise = testUtils.createAndBindQueue("q1", {}, "routingKey1", connection, excFanout);
			var q2Promise = testUtils.createAndBindQueue("q2", {}, "routingKey2", connection, excFanout);
			var q3Promise = testUtils.createAndBindQueue("q3", {}, "", connection, excFanout);

			return Q.all([ q1Promise, q2Promise, q3Promise ]).spread(function(q1, q2, q3) {
				var spy1 = testUtils.spy(testerObj, "cb1");
				var spy2 = testUtils.spy(testerObj, "cb2");
				var spy3 = testUtils.spy(testerObj, "cb3");

				q1.subscribe(testerObj.cb1);
				q2.subscribe(testerObj.cb2);
				q3.subscribe(testerObj.cb3);
				return Q.delay(1).then(function() {

					excFanout.publish("routingKey1", "testMessage");
					return Q.delay(1).then(function() {
						// expect all queues to get the message
						expect(spy1).to.have.been.calledWith("testMessage");
						expect(spy2).to.have.been.calledWith("testMessage");
						expect(spy3).to.have.been.calledWith("testMessage");
					});
				});
			});
		});
	});

	context("of type topic", function() {

		var excTopic;

		beforeEach(function(done) {
			excTopic = connection.exchange("testExchange", {}, function() {
				done();
			});

			excTopic.on("error", done);
			expect(excTopic).to.be.ok;
			expect(excTopic.options).to.be.ok;
			// default should be topic
			expect(excTopic.options.type).to.equal("topic");
		});

		context("routing with", function() {

			it("multiple bind matches should only publish to the queue one time", function() {
				var q1Promise = testUtils.createAndBindQueue("q1", {}, "*.*", connection, excTopic);
				return Q.all([ q1Promise ]).spread(function(q1) {

					var defer = Q.defer();
					q1.bind(excTopic, "foo.*", function() {
						defer.resolve();
					});

					var spy1 = testUtils.spy(testerObj, "cb1");
					q1.subscribe(testerObj.cb1);

					q1.on("error", defer.reject);
					return defer.promise.then(function() {
						excTopic.publish("foo.bar", "testMessage");
						return Q.delay(1).then(function() {
							expect(spy1).to.have.been.calledWith("testMessage");
							expect(spy1.withArgs("testMessage").callCount).to.equal(1);
						});
					});
				});
			});

			var checkRouteBinding = function(bindPattern, routeKey, expectMatch) {
				var q1Promise = testUtils.createAndBindQueue("q1", {}, bindPattern, connection, excTopic);
				return Q.all([ q1Promise ]).spread(function(q1) {
					var spy1 = testUtils.spy(testerObj, "cb1");
					q1.subscribe(testerObj.cb1);
					return Q.delay(1).then(function() {
						excTopic.publish(routeKey, "testMessage");
						return Q.delay(1).then(function() {
							// expect all queues to get the message
							if (expectMatch) {
								expect(spy1).to.have.been.calledWith("testMessage");
							} else {
								expect(spy1).not.to.have.been.calledWith("testMessage");
							}
						});
					});
				});
			};

			context("* style binding keys", function() {
				it("should match not match * with an empty string routing key", function() {
					return checkRouteBinding("*", "", false);
				});
				it("should match match * with a whitespace routing key", function() {
					return checkRouteBinding("*", " ", true);
				});
				it("should match match empty route with an empty routing key", function() {
					return checkRouteBinding("", "", true);
				});
				it("should match *.*.foo with bar.baz.foo", function() {
					return checkRouteBinding("*.*.foo", "bar.baz.foo", true);
				});
				it("should not match *.foo with bar.baz.foo", function() {
					return checkRouteBinding("*.foo", "bar.baz.foo", false);
				});
				it("should match *.foo.baz.* with bar.foo.baz.bar", function() {
					return checkRouteBinding("*.foo.baz.*", "bar.foo.baz.bar", true);
				});
				it("should not match *.foo.* with bar.baz.foo.bar", function() {
					return checkRouteBinding("*.foo.*", "bar.baz.foo.bar", false);
				});
			});

			context("# style binding keys", function() {
				it("should match #.foo with baz.bar.foo", function() {
					return checkRouteBinding("#.foo", "baz.bar.foo", true);
				});
				it("should match #.foo.*.baz.# with baz.bar.foo.jaz.baz.bar.bar", function() {
					return checkRouteBinding("#.foo.*.baz.#", "baz.bar.foo.jaz.baz.bar.bar", true);
				});
				it("should not match #.foo with bar.baz.foo.bat", function() {
					return checkRouteBinding("#.foo", "bar.baz.foo.bat", false);
				});
				it("should match *.*.# with foo.bar", function() {
					return checkRouteBinding("*.*.#", "foo.bar", true);
				});
				it("should not match *.*.# with foo", function() {
					return checkRouteBinding("*.*.#", "foo", false);
				});
				it("should match *.# with foo", function() {
					return checkRouteBinding("*.#", "foo", true);
				});
			});

		});

	});

	context("of type direct", function() {

		var excDirect;

		beforeEach(function(done) {
			excDirect = connection.exchange("testExchange", {
				type : "direct"
			}, function() {
				done();
			});
			excDirect.on("error", done);
			expect(excDirect).to.be.ok;
			expect(excDirect.options).to.be.ok;
			// default should be topic
			expect(excDirect.options.type).to.equal("direct");
		});

		it("should not route messages if the binding keys differ in case", function() {
			var q1Promise = testUtils.createAndBindQueue("q1", {}, "routingKey1", connection, excDirect);
			var q2Promise = testUtils.createAndBindQueue("q2", {}, "routingkey1", connection, excDirect);
			var q3Promise = testUtils.createAndBindQueue("q3", {}, "", connection, excDirect);
			return Q.all([ q1Promise, q2Promise, q3Promise ]).spread(function(q1, q2, q3) {
				var spy1 = testUtils.spy(testerObj, "cb1");
				var spy2 = testUtils.spy(testerObj, "cb2");
				var spy3 = testUtils.spy(testerObj, "cb3");

				q1.subscribe(testerObj.cb1);
				q2.subscribe(testerObj.cb2);
				q3.subscribe(testerObj.cb3);
				return Q.delay(1).then(function() {

					excDirect.publish("routingKey1", "testMessage");
					return Q.delay(1).then(function() {
						// expect only first queue to get the message
						expect(spy1).to.have.been.calledWith("testMessage");
						expect(spy2).not.to.have.been.calledWith("testMessage");
						expect(spy3).not.to.have.been.calledWith("testMessage");
					});
				});
			});
		});

		it("should route messages to all bindings that match the routing key exactly", function() {
			var q1Promise = testUtils.createAndBindQueue("q1", {}, "routingKey1", connection, excDirect);
			var q2Promise = testUtils.createAndBindQueue("q2", {}, "routingKey1", connection, excDirect);
			var q3Promise = testUtils.createAndBindQueue("q3", {}, "", connection, excDirect);
			return Q.all([ q1Promise, q2Promise, q3Promise ]).spread(function(q1, q2, q3) {
				var spy1 = testUtils.spy(testerObj, "cb1");
				var spy2 = testUtils.spy(testerObj, "cb2");
				var spy3 = testUtils.spy(testerObj, "cb3");

				q1.subscribe(testerObj.cb1);
				q2.subscribe(testerObj.cb2);
				q3.subscribe(testerObj.cb3);

				return Q.delay(1).then(function() {
					excDirect.publish("routingKey1", "testMessage");
					return Q.delay(1).then(function() {
						expect(spy1).to.have.been.calledWith("testMessage");
						expect(spy2).to.have.been.calledWith("testMessage");
						expect(spy3).not.to.have.been.calledWith("testMessage");
					});
				});
			});
		});

		it("should handle empty string routing keys correctly", function() {

			var q1Promise = testUtils.createAndBindQueue("q1", {}, "routingKey1", connection, excDirect);
			var q2Promise = testUtils.createAndBindQueue("q2", {}, "routingkey1", connection, excDirect);
			var q3Promise = testUtils.createAndBindQueue("q3", {}, "", connection, excDirect);
			return Q.all([ q1Promise, q2Promise, q3Promise ]).spread(function(q1, q2, q3) {
				var spy1 = testUtils.spy(testerObj, "cb1");
				var spy2 = testUtils.spy(testerObj, "cb2");
				var spy3 = testUtils.spy(testerObj, "cb3");

				q1.subscribe(testerObj.cb1);
				q2.subscribe(testerObj.cb2);
				q3.subscribe(testerObj.cb3);

				return Q.delay(1).then(function() {
					excDirect.publish("", "testMessage");
					return Q.delay(1).then(function() {
						// expect only first queue to get the message
						expect(spy1).not.to.have.been.calledWith("testMessage");
						expect(spy2).not.to.have.been.calledWith("testMessage");
						expect(spy3).to.have.been.calledWith("testMessage");
					});
				});
			});

		});

		it("should handle null routing keys correctly");

	});

	context("when redeclaring with different options", function() {

		//[Error: PRECONDITION_FAILED - cannot redeclare exchange 'myExchange' in vhost '/' with different type, durable, internal or autodelete value] code: 406 }
		it("should fail with 406 when the type options are different");
		it("should fail with 406 when the durable options are different");
		it("should fail with 406 when the internal options are different");
		it("should fail with 406 when the autodelete options are different");
	});

	context("binding", function() {

		it("should republish messages from the bound exchange");

		it("should fail silently when routingKey is null and exchange is specified");// to match the real module

	});

	context("destroy", function() {

		it("should not allow deletion of default exchanges");

		it("should complete ifUnused is true and there are no more bound objects to the queue");

		it("should error ifUnused is true and there are bound objects");

		it("should complete ifUnused is false and there are still bound objects");

	});
});
