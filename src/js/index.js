"use strict";

const timers = require("timers");
const async = require("async");
const logger = require("./logger.js");
const linphone = require("./linphone.js");
const gpio = require("./gpio.js");
const config = require("./config.json");

let runtimeLoopTimer = undefined;
let timeoutTimer = undefined;
let dialStart = undefined;
let callStart = undefined;
let buttonStart = undefined;
let lastAliveInfo = undefined;

logger.init(config.log);

function runtimeTimeout() {
	logger.log("[RUNTIME] Timeout reached during runtime execution; starting new runtime loop.");
	runtimeLoop();
}

function handleError(err) {
	logger.log("[RUNTIME] Error: ", err);
}

function runtimeLoop() {

	const start = new Date();

	// set timeout, in case that something hangs

	if(timeoutTimer !== undefined) {
		timers.clearTimeout(timeoutTimer);
	}

	timeoutTimer = timers.setTimeout(runtimeTimeout, config.runtime.timeout);

	// every now and then, show that we are still alive

	const now = new Date();

	if(lastAliveInfo === undefined || now - lastAliveInfo > 5000) {
		logger.log("[RUNTIME] still alive, all good.");
		lastAliveInfo = now;
	}

	// do something

	const earlyExit = new Error();

	async.waterfall([
		linphone.isInitialized,
		(isInitialized, cb) => {
			if (isInitialized) {
				cb(null);
				return;
			}

			logger.log("[RUNTIME] Not initialized. Initializing ...");

			linphone.init(err => cb(err || earlyExit));
		},
		linphone.isRegistered,
		(isRegistered, cb) => {
			if (isRegistered) {
				cb(null);
				return;
			}

			logger.log("[RUNTIME] Not registered. Registering ...");

			linphone.register(err => cb(err || earlyExit));
		},
		linphone.isDialing,
		(isDialing, cb) => {
			const now = new Date();
			if (isDialing) {

				if (dialStart === undefined) {
					dialStart = now;
				}
				
				if (now - dialStart >= config.runtime.maxDialDuration) {
					dialStart = undefined;
					logger.log("[RUNTIME] Maximum dial duration exceeded. Terminating call.");
					linphone.terminateCalls(err => cb(err || earlyExit));
					return;
				}

				cb(earlyExit);
				return;
			}

			// safety measure. should not be needed, but doesn't harm.
			dialStart = undefined;
			cb(null);
		},
		linphone.isInCall,
		(isInCall, cb) => {
			const now = new Date();
			if (isInCall) {

				if (callStart === undefined) {
					callStart = now;
				}
				
				if (now - callStart >= config.runtime.maxCallDuration) {
					callStart = undefined;
					logger.log("[RUNTIME] Maximum call duration exceeded. Terminating call.");
					linphone.terminateCalls(err => cb(err || earlyExit));
					return;
				}

				cb(earlyExit);
				return;
			}

			// safety measure. should not be needed, but doesn't harm.
			callStart = undefined;
			cb(null);
		},
		gpio.isButtonPressed,
		(isButtonPressed, cb) => {
			const now = Date();

			if (isButtonPressed) {

				if (buttonStart === undefined) {
					logger.log("[RUNTIME] Button pressed. Initiating call.");
					buttonStart = now;
					linphone.initiateCall(err => cb(err || earlyExit));
					return;
				}
				
				if (now - buttonStart > config.runtime.maxButtonDuration) {
					logger.log("[RUNTIME] Maximum button press duration exceeded. Resetting runtime button state.");
					buttonStart = undefined;
				}

				cb(earlyExit)
				return;
			}

			// safety measure. should not be needed, but doesn't harm.
			buttonStart = undefined;
			cb(null);
		}
	], done);

	// schedule next runtimeLoop

	function done(err) {
		if(err) {
			if(err === earlyExit) {
				// nothing to do; just our way to exit the waterfall earlier.
			}
			else if(err.message === "deregistered") {
				// the client is stuck in deregistered state.
				// only solution at this time is to kill and restart it.
				logger.log("[RUNTIME] linphone client is in deregistered state. Restarting linphone ...");
				linphone.exit(err => done(err));
				return;
			}
			else {
				logger.log("[RUNTIME] Error: ", err);
			}
		}

		const end = new Date();
		logger.log(`[RUNTIME] loop execution finished in Â${end-start} ms`);

		runtimeLoopTimer = timers.setTimeout(runtimeLoop, config.runtime.interval);
	}
}

gpio.setup(config.gpio, () => {
	linphone.configure(config);
	linphone.exit(() => {
		runtimeLoopTimer = timers.setTimeout(runtimeLoop, 0);
	});
});
