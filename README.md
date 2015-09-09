# Fake Amqp

This is an in memory implementation of the [amqp](https://github.com/postwait/node-amqp) module for testing purposes.

The aim of this project is to simulate the [amqp](https://github.com/postwait/node-amqp) module as best as possible to test various amqp interactions. It will produce realistic errors for various scenarios (e.g. exchange / queue doesn't exist or is locked with exclusive option).

This is a work in progress, please log any issues you come across.

## Usage

		var amqp = require("amqp");
		var fakeAmqp = require("fake-amqp");
		amqp.createConnection = fakeAmqp.createConnection;
		amqp.Connection = fakeAmqp.Connection;

You may wish to call reset in your afterEach helper to clear out the state and start fresh with the default exchanges:

		afterEach(function (done) {
            // if your testing framework supports promises you can simply return the promise from reset()
            fakeAmqp.reset().then(done);
		});
		
## Supported Features

### Queue
* passive
* noDelcare
* exclusive		
* exclusive subscribers
* autoDelete
* closeChannelOnUnsubscribe
* default exchange binding

### Exchange
* default exchanges
* passive
* noDelcare
* exclusive
* types: fanout, direct, topic
* routingKey matching for direct (exact match) and topic style wildcard keys (e.g. *.foo.#)
* autoDelete
* binding to another exchange

## Unsupported Features 
* Exchange confirm option
* Headers type exchanges
* Queue subscribeRaw
* Connection reconnect