"use strict";

const path = require("path");
const filelogger = require("file-logger");
const timers = require("timers");
const async = require("async");
const linphone = require("./linphone.js");
const gpio = require("./gpio.js");
const config = require("./config.json");

let runtimeLoopTimer = undefined;
let timeoutTimer = undefined;
let dialStart = undefined;
let callStart = undefined;
let buttonStart = undefined;

const logfile = path.resolve(path.join(__dirname, "../../", config.log.filename));
filelogger(logfile);

function runtimeTimeout() {
	console.log("[RUNTIME] Timeout reached during runtime execution; starting new runtime loop.");
	start();
}

function handleError(err) {
	console.log("[RUNTIME] Error: ", err);
}

function runtimeLoop() {

	// set timeout, in case that something hangs

	timeoutTimer = timers.setTimeout(runtimeTimeout, config.runtime.timeout);

	// do something

	const earlyExit = new Error();

	async.waterfall([
		linphone.isInitialized,
		(isInitialized, cb) => {
			if (isInitialized) {
				cb(null);
			}
			else {
				console.log("[RUNTIME] Not initialized. Initializing ...");
				linphone.init(cb);
			}
		},
		linphone.isRegistered,
		(isRegistered, cb) => {
			if (isRegistered) {
				cb(null);
			}
			else {
				console.log("[RUNTIME] Not registered. Registering ...");
				linphone.register(cb);
			}
		},
		linphone.isDialing,
		(isDialing, cb) => {
			const now = new Date();
			if (isDialing) {

				if (dialStart === undefined) {
					dialStart = now;
				}
				else if (now - dialStart >= cfg.runtime.maxDialDuration) {
					dialStart = undefined;
					console.log("[RUNTIME] Maximum dial duration exceeded. Terminating call.");
					linphone.terminateCalls(cb);
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
				else if (now - callStart >= cfg.runtime.maxCallDuration) {
					callStart = undefined;
					console.log("[RUNTIME] Maximum call duration exceeded. Terminating call.");
					linphone.terminateCalls(cb);
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
					console.log("[RUNTIME] Button pressed. Initiating call.");
					buttonStart = now;
					linphone.initiateCall(cb);
				}
				else if (now - buttonStart > cfg.runtime.maxButtonDuration) {
					console.log("[RUNTIME] Maximum button press duration exceeded. Resetting runtime button state.");
					buttonStart = undefined;
					cb(earlyExit);
					return;
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
			console.log("[RUNTIME] Error: ", err);
		}
		runtimeLoopTimer = timers.setTimeout(runtimeLoop, config.runtime.interval);
	}
}

gpio.setup(config.gpio, () => {
	linphone.configure(config);
	runtimeLoopTimer = timers.setTimeout(runtimeLoop, 0);
});
