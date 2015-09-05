'use strict';
var MockConnection = require('./lib/MockConnection.js');

module.exports = {

	Connection : MockConnection,

	createConnection : function(options, implOptions, readyCallback) {
		var c = new MockConnection(options, implOptions, readyCallback);
		c.connect();
		return c;
	},

	/**
	 * should be called in afterEach of the test suite to clear out all data / queues
	 * This will force a close event to be emitted from all active exchanges / queues and connections
	 * @returns a promise for when reset has finished
	 */
	reset : function() {
		return MockConnection.MOCK_RESET();
	}
};
