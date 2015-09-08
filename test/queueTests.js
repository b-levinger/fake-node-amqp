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

	var createExchange = function(connection, name, options) {
		var defer = Q.defer();
		var onError;
		var exchange = connection.exchange(name, options, function() {
			defer.resolve(exchange);
		});
		exchange.on("error", onError = function(err) {
			defer.reject(err);
		});
		defer.promise.fin(function() {
			exchange.removeListener('error', onError);
		});
		return defer.promise;
	};

	var createQueue = function(connection, name, options) {
		var defer = Q.defer();
		var onError;
		var q = connection.queue(name, options, function() {
			defer.resolve(q);
		});
		q.on("error", onError = function(err) {
			defer.reject(err);
		});
		defer.promise.fin(function() {
			q.removeListener('error', onError);
		});
		return defer.promise;
	};

	var bindQueue = function(q, exchange, routingKey) {
		var defer = Q.defer();
		var onError;
		if (routingKey === undefined) {
			q.bind(exchange, function() {
				defer.resolve();
			});
		} else {
			q.bind(exchange, routingKey, function() {
				defer.resolve();
			});
		}
		q.on("error", onError = function(err) {
			defer.reject(err);
		});
		defer.promise.fin(function() {
			q.removeListener("error", onError);
		});
		return defer.promise;
	};

	var subscribeQueue = function(q, options, dataCallback) {
		var defer = Q.defer();
		var onError;

		q.on("error", onError = function(err) {
			defer.reject(err);
		})
		q.subscribe(options, dataCallback).addCallback(function(data) {
			defer.resolve(data);
		});

		defer.promise.fin(function() {
			q.removeListener("error", onError);
		});
		return defer.promise;
	};

	context("when redeclaring", function() {

		it("should fail with 406 if the durable option is different", function() {
			return createQueue(connection, "testQueue", {
				durable : true
			}).then(function(q1) {
				return createQueue(connection, "testQueue", {
					durable : false
				}).then(function(q2) {
					return Q.reject(new Error("expected error 406"));
				}, function(err) {
					expect(err).to.be.ok;
					expect(err.code).to.equal(406);
					expect(err.message).to.equal("Error: PRECONDITION_FAILED - parameters for queue 'testQueue' in vhost '/' not equivalent")
				});
			});
		});

		it("should fail with 406 if the autoDelete option is different", function() {
			return createQueue(connection, "testQueue", {
				autoDelete : true
			}).then(function(q1) {
				return createQueue(connection, "testQueue", {
					autoDelete : false
				}).then(function(q2) {
					return Q.reject(new Error("expected error 406"));
				}, function(err) {
					expect(err).to.be.ok;
					expect(err.code).to.equal(406);
					expect(err.message).to.equal("Error: PRECONDITION_FAILED - parameters for queue 'testQueue' in vhost '/' not equivalent")
				});
			});
		});

	});

	it("should bind to the default queue with routekey of the queue name", function(done) {
		var spy;
		var q = connection.queue("testQueue", {}, function() {
			try {
				expect(spy).to.have.been.calledWith("", "testQueue");
				done();
			} catch (err) {
				done(err);
			}
		});
		spy = testUtils.spy(q, "bind");
		q.on("error", done);
	});

	it("should be created with proper default options", function() {
		return createQueue(connection, "testQueue", {}).then(function(q) {
			expect(q.options).to.be.ok;
			expect(q.options.noDeclare).not.to.be.ok;
			expect(q.options.passive).not.to.be.ok;
			expect(q.options.durable).not.to.be.ok;
			expect(q.options.exclusive).not.to.be.ok;
			expect(q.options.autoDelete).to.equal(true);
			expect(q.options.closeChannelOnUnsubscribe).not.to.be.ok;
		});
	});

	context("with noDeclare option true", function() {

		context("and the queue doesnt actually exist", function() {

			it("should fail with 404 when bind is called", function() {
				return createQueue(connection, "testQueue", {
					noDeclare : true
				}).then(function(q) {
					expect(q).to.be.ok;
					return bindQueue(q, "amq.topic", "").then(function() {
						return Q.reject(new Error("expected 404 error"));
					}, function(err) {
						expect(err).to.be.ok;
						expect(err.code).to.equal(404);
						expect(err.message).to.equal("Error: NOT_FOUND - no queue 'testQueue' in vhost '/'");
					});
				});
			});

			it("should succeed when unbind is called", function(done) {
				return createQueue(connection, "testQueue", {
					noDeclare : true
				}).then(function(q) {
					expect(q).to.be.ok;
					q.on("queueUnbindOk", done);
					q.on("errror", done);
					q.unbind("amq.topic", "");
				});
			});

			it("should fail with 404 when subscribe is called", function() {
				return createQueue(connection, "testQueue", {
					noDeclare : true
				}).then(function(q) {
					expect(q).to.be.ok;
					return subscribeQueue(q, {}, function() {
					}).then(function() {
						return Q.reject(new Error("expected 404 error"));
					}, function(err) {
						expect(err).to.be.ok;
						expect(err.code).to.equal(404);
						expect(err.message).to.equal("Error: NOT_FOUND - no queue 'testQueue' in vhost '/'");
					});
				});
			});
		});

	});

	context("created with autoDelete option true", function() {

		it("should destroy themselves after the last subscriber has unsubscribed and fire close event", function() {
			return createQueue(connection, "testQueue", {
				autoDelete : true
			}).then(function(q) {
				return subscribeQueue(q, {}, function() {
				}).then(function(sdata) {
					var consumerTag = sdata.consumerTag;
					expect(consumerTag).to.be.a("string");
					q.unsubscribe(consumerTag);
					return Q.delay(1).then(function() {
						// queue should actually be deleted now
						return bindQueue(q, "amq.topic", "").then(function() {
							return Q.reject(new Error("expected 404 error"));
						}, function(err) {
							expect(err).to.be.ok;
							expect(err.code).to.equal(404);
							expect(err.message).to.equal("Error: NOT_FOUND - no queue 'testQueue' in vhost '/'");
						});
					});
				});
			});
		});

		it("should not fire the close event when the autodelete occurs (bug in amqp?)", function() {

			return createQueue(connection, "testQueue", {
				autoDelete : true
			}).then(function(q) {
				var closeCalled = false;
				q.on("close", function() {
					closeCalled = true;
				});
				return subscribeQueue(q, {}, function() {
				}).then(function(sdata) {
					var consumerTag = sdata.consumerTag;
					expect(consumerTag).to.be.a("string");
					q.unsubscribe(consumerTag);
					return Q.delay(5).then(function() {
						expect(closeCalled).to.equal(false);
					});
				});
			});

		});

	});

	context("created with closeChannelOnUnsubscribe option true", function() {

		it("should fire the close the queue when unsubscribe is called on any subscriber", function() {
			return createQueue(connection, "testQueue", {
				closeChannelOnUnsubscribe : true
			}).then(function(q) {
				var closeCalled = false;
				q.on("close", function() {
					closeCalled = true;
				});
				return subscribeQueue(q, {}, function() {
				}).then(function(sdata) {
					var consumerTag = sdata.consumerTag;
					expect(consumerTag).to.be.a("string");
					return subscribeQueue(q, {}, function() {
					}).then(function(sdata) {
						var consumerTag = sdata.consumerTag;
						expect(consumerTag).to.be.a("string");
						q.unsubscribe(consumerTag);
						return Q.delay(5).then(function() {
							expect(closeCalled).to.equal(true);
						});
					});
				});
			});
		});

	});

	context("created with passive option true", function() {

		it("should error if the queue doesnt exist with code 404", function() {
			return createQueue(connection, "testQueue", {
				passive : true
			}).then(function(q1) {
				return Q.reject(new Error("passive queue should not have opened"));
			}, function(err) {
				expect(err.code).to.equal(404);
				expect(err.message).to.equal("Error: NOT_FOUND - no queue 'testQueue' in vhost '/'");
			});
		});

		it("should not error if the queue does exist", function() {
			return createQueue(connection, "testQueue", {}).then(function(q1) {
				return createQueue(connection, "testQueue", {
					passive : true
				}).then(function(q2) {
					expect(q2).to.be.ok;
				});
			});
		});

	});

	context("created with exclusive option true", function() {

		it("should error with code 403 if queue has already been created with exclusive", function() {
			return createQueue(connection, "testQueue", {
				exclusive : true
			}).then(function(q1) {
				return createQueue(connection, "testQueue", {
					exclusive : false
				}).then(function(q1) {
					return Q.reject(new Error("queue should not have opened, already opened with exclusive true"));
				}, function(err) {
					expect(err.code).to.equal(403);
					expect(err.message).to.equal("Error: ACCESS_REFUSED - queue 'testQueue' in vhost '/' in exclusive use");
				});
			});
		});

		it("should error with code 405 if queue was previously created without exclusive", function() {
			return createQueue(connection, "testQueue", {
				exclusive : false
			}).then(function(q1) {
				return createQueue(connection, "testQueue", {
					exclusive : true
				}).then(function(q1) {
					return Q.reject(new Error("queue should not have opened, already opened with exclusive true"));
				}, function(err) {
					expect(err.code).to.equal(405);
					expect(err.message).to.equal("Error: RESOURCE_LOCKED - cannot obtain exclusive access to locked queue 'testQueue' in vhost '/'");
				});
			});
		});

		it("should also be considered autoDelete and should delete when the last subscriber has unsubscribed", function() {
			return createQueue(connection, "testQueue", {
				exclusive : true
			}).then(function(q) {
				return subscribeQueue(q, {}, function() {
				}).then(function(sdata) {
					var consumerTag = sdata.consumerTag;
					expect(consumerTag).to.be.a("string");
					q.unsubscribe(consumerTag);
					return Q.delay(1).then(function() {
						// queue should actually be deleted now
						return bindQueue(q, "amq.topic", "").then(function() {
							return Q.reject(new Error("expected 404 error"));
						}, function(err) {
							expect(err).to.be.ok;
							expect(err.code).to.equal(404);
							expect(err.message).to.equal("Error: NOT_FOUND - no queue 'testQueue' in vhost '/'");
						});
					});
				});
			});
		});

		context("after being destroyed", function() {

			it("should allow another queue with the same name to be declared", function() {
				return createQueue(connection, "testQueue", {
					exclusive : true
				}).then(function(q) {
					q.destroy();
					return Q.delay(1).then(function() {
						return createQueue(connection, "testQueue", {
							exclusive : true
						});
					});
				});
			});
		});
	});

	context("when binding", function() {

		//TODO investigate this more
		it("should fail silently when routingKey is null and exchange is specified");// to match the real module

		it("with empty string for exchange and routing key should throw 403", function() {
			return createQueue(connection, "testQueue", {}).then(function(q) {
				return bindQueue(q, "", "").then(function() {
					return Q.reject(new Error("not expected"));
				}, function(err) {
					expect(err).to.be.ok;
					expect(err.code).to.equal(403);
					expect(err.message).to.equal("Error: ACCESS_REFUSED - operation not permitted on the default exchange");
				});
			});
		});

		it("should accept exchange objects as the first parameter", function() {
			return createExchange(connection, "testExchange", {}).then(function(exchange) {
				return createQueue(connection, "testQueue", {}).then(function(q) {
					var spy = testUtils.spy(q, "triggerMockBind");
					return bindQueue(q, exchange, "").then(function() {
						expect(spy).to.have.been.calledWith("testExchange");
					});
				});
			});
		});

		it("should accept exchange name as the first parameter", function() {
			return createExchange(connection, "testExchange", {}).then(function(exchange) {
				return createQueue(connection, "testQueue", {}).then(function(q) {
					var spy = testUtils.spy(q, "triggerMockBind");
					return bindQueue(q, "testExchange", "").then(function() {
						expect(spy).to.have.been.calledWith("testExchange");
					});
				});
			});
		});

		it("should bind to amq.topic if no exchange is specified", function() {
			return createExchange(connection, "testExchange", {}).then(function(exchange) {
				return createQueue(connection, "testQueue", {}).then(function(q) {
					var spy = testUtils.spy(q, "triggerMockBind");
					return bindQueue(q, "", undefined).then(function() {
						expect(spy).to.have.been.calledWith("amq.topic");
					});
				});
			});
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

		it("should not emit queueBindOk for the default queue bind", function(done) {
			var q = connection.queue("testQueue", {}, function() {
				setTimeout(function() {
					done();
				}, 1);
			});
			q.on("queueBindOk", function() {
				done(new Error("should not have triggered queueBindOk"));
			});
		});

		it("should emit error with 404 if the exchange doesnt exist", function(done) {
			var q = connection.queue("myQueue", {}, function() {
				var spy = testUtils.spy(q, "triggerMockBind");
				q.bind("someNotFoundExchange", "", function() {
					done(new Error("queue should not have been able to bind"));
				});
			});
			q.on("error", function(err) {
				try {
					expect(err.message).to.equal("Error: NOT_FOUND - no exchange 'someNotFoundExchange' in vhost '/'");
					expect(err.code).to.equal(404);
					done();
				} catch (err) {
					done(err);
				}
			});
		});

	});

	context("after subscribing", function() {

		it("should emit data from a bound exchange to the subscribers", function() {
			var testerObj = {
				cb1 : function() {
				}
			};
			var spy1 = testUtils.spy(testerObj, "cb1");
			return createExchange(connection, "testExchange", {}).then(function(exchange) {
				return createExchange(connection, "testExchange2", {}).then(function(exchange2) {
					return createQueue(connection, "testQueue", {}).then(function(q) {
						return bindQueue(q, exchange, "").then(function() {
							return bindQueue(q, exchange2, "").then(function() {
								return subscribeQueue(q, {}, testerObj.cb1).then(function() {
									exchange.publish("", "data1");
									exchange2.publish("", "data2");
									return Q.delay(1).then(function() {
										expect(spy1).to.have.been.calledWith("data1");
										expect(spy1).to.have.been.calledWith("data2");
									});
								});
							});
						});
					});
				});
			});
		});

		it("should return a promise with the consumer tag", function() {
			return createQueue(connection, "testQueue", {}).then(function(q) {
				return subscribeQueue(q, {}, function() {
				}).then(function(sdata) {
					var consumerTag = sdata.consumerTag;
					expect(consumerTag).to.be.a("string");
				});
			});
		});

		it("should emit message events round robin for all subscribers", function() {
			var testerObj = {
				cb1 : function() {
				},
				cb2 : function() {
				},
				cb3 : function() {
				}
			};

			var spy1 = testUtils.spy(testerObj, "cb1");
			var spy2 = testUtils.spy(testerObj, "cb2");
			var spy3 = testUtils.spy(testerObj, "cb3");

			return createExchange(connection, "testExchange", {}).then(function(exchange) {
				return createQueue(connection, "testQueue", {}).then(function(q) {
					return bindQueue(q, exchange, "").then(function() {
						return subscribeQueue(q, {}, testerObj.cb1).then(function() {
							return subscribeQueue(q, {}, testerObj.cb2).then(function() {
								return subscribeQueue(q, {}, testerObj.cb3);
							});
						}).then(function() {
							exchange.publish("", "data1");
							exchange.publish("", "data2");
							exchange.publish("", "data3");
							exchange.publish("", "data4");
							exchange.publish("", "data5");
							return Q.delay(1).then(function() {
								expect(spy1).to.have.been.calledWith("data1");
								expect(spy1).not.to.have.been.calledWith("data2");
								expect(spy1).not.to.have.been.calledWith("data3");
								expect(spy1).not.to.have.been.calledWith("data5");
								expect(spy2).not.to.have.been.calledWith("data1");
								expect(spy2).to.have.been.calledWith("data2");
								expect(spy2).to.have.been.calledWith("data5");
								expect(spy1).not.to.have.been.calledWith("data3");
								expect(spy3).to.have.been.calledWith("data3");
								expect(spy1).to.have.been.calledWith("data4");
							});
						});
					});
				});
			});
		});

		context("on multiple instances of a queue with the same name", function() {

			it("should still round robin dispatch the events across all subscribers, even for different instances of the queue object", function() {

				var testerObj = {
					cb1 : function() {
					},
					cb2 : function() {
					},
					cb3 : function() {
					}
				};

				var spy1 = testUtils.spy(testerObj, "cb1");
				var spy2 = testUtils.spy(testerObj, "cb2");
				var spy3 = testUtils.spy(testerObj, "cb3");

				return createExchange(connection, "testExchange", {}).then(function(exchange) {
					return createQueue(connection, "testQueue", {}).then(function(q) {
						return bindQueue(q, exchange, "").then(function() {
							return createQueue(connection, "testQueue", {}).then(function(q2) {
								return bindQueue(q2, exchange, "").then(function() {
									subscribeQueue(q, {}, testerObj.cb1);
									subscribeQueue(q2, {}, testerObj.cb2);
									subscribeQueue(q, {}, testerObj.cb3).then(function() {
										exchange.publish("", "data1");
										exchange.publish("", "data2");
										exchange.publish("", "data3");
										exchange.publish("", "data4");
										exchange.publish("", "data5");
										return Q.delay(1).then(function() {
											expect(spy1).to.have.been.calledWith("data1");
											expect(spy1).to.have.been.calledWith("data4");
											expect(spy1).not.to.have.been.calledWith("data2");
											expect(spy1).not.to.have.been.calledWith("data3");
											expect(spy1).not.to.have.been.calledWith("data5");
											expect(spy2).to.have.been.calledWith("data2");
											expect(spy2).to.have.been.calledWith("data5");
											expect(spy1).not.to.have.been.calledWith("data1");
											expect(spy1).not.to.have.been.calledWith("data3");
											expect(spy1).not.to.have.been.calledWith("data4");
											expect(spy3).to.have.been.calledWith("data4");
										});
									});
								});
							});
						});
					});
				});
			});
		});

	});

	context("when unsubscribing", function() {

		it("should return a promise", function() {
			return createQueue(connection, "testQueue", {}).then(function(q) {
				return subscribeQueue(q, {}, function() {
				}).then(function(sdata) {
					expect(sdata).to.be.ok;
					var ctag = sdata.consumerTag
					expect(ctag).to.be.a("string");
					var promise = q.unsubscribe(ctag);
					expect(promise).to.be.ok;
					expect(promise.addCallback).to.be.a("function");
				});

			});
		});

		it("should allow unsubscribe by contentTags, and no longer send data from bound exchanges to those listeners", function() {
			var testerObj = {
				cb1 : function() {
				},
				cb2 : function() {
				}
			};
			var spy1 = testUtils.spy(testerObj, "cb1");
			var spy2 = testUtils.spy(testerObj, "cb2");
			return createExchange(connection, "testExchange", {}).then(function(exchange) {
				return createQueue(connection, "testQueue", {}).then(function(q) {
					return bindQueue(q, exchange, "").then(function() {
						subscribeQueue(q, {}, testerObj.cb1);
						return subscribeQueue(q, {}, testerObj.cb2).then(function(sdata2) {
							expect(sdata2).to.be.ok;
							var consumerTag2 = sdata2.consumerTag;
							expect(consumerTag2).to.be.a("string")

							exchange.publish("", "data1");
							exchange.publish("", "data2");

							return Q.delay(1).then(function() {
								expect(spy1).to.have.been.calledWith("data1");
								expect(spy2).to.have.been.calledWith("data2");

								q.unsubscribe(consumerTag2);
								return Q.delay(1).then(function() {
									exchange.publish("", "data3");
									exchange.publish("", "data4");
									exchange.publish("", "data5");
									return Q.delay(1).then(function() {
										expect(spy1).to.have.been.calledWith("data3");
										expect(spy1).to.have.been.calledWith("data4");
										expect(spy1).to.have.been.calledWith("data5");
										expect(spy2).not.to.have.been.calledWith("data3");
										expect(spy2).not.to.have.been.calledWith("data4");
										expect(spy2).not.to.have.been.calledWith("data5");
									});
								});
							});
						});
					});
				});
			});
		});
	});

});