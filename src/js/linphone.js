"use strict";

const timers = require("timers");
const exec = require("child_process").exec;
const logger = require("./logger.js");

const RETURN_IMMEDIATELY = 0;

var cfg = undefined;

function configure(config) {
	cfg = config;
}

function linphone(args, delay, cb) {

	if(typeof cb !== 'function') {
		throw(new Error('[linphone] invalid callback parameter (not a function)'));
	}

	const cmdline = `${cfg.linphone.cmd} ${args}`;
	const verbose = cfg.linphone.verbose === true;

	if (verbose) {
		logger.log(`[linphone] exec: ${JSON.stringify(cmdline)}`)
	}

	exec(cmdline, (err, stdout, stderr) => {

		const output = stdout && stdout.toString().trim() || '';

		if (verbose) {
			logger.log(`[linphone] result: ${JSON.stringify(output)}`);
		}

		timers.setTimeout(() => cb(null, output), delay);
	});
}

function exit(cb) {
	// the problem with "exit" is that it returns rather quickly,
	// but the daemon may need more time to exit, and while doing
	// so, it is still blocking port 5060. therefore: extra-long delay.
	linphone('exit', cfg.linphone.delay * 60, cb);
}

function init(cb) {
	linphone('init', cfg.linphone.delay * 30, cb);
}

function isInitialized(cb) {
	linphone('status register', RETURN_IMMEDIATELY, (err, result) => {
		cb(err, !!result);
	});
}

function isRegistered(cb) {
	linphone('status register', RETURN_IMMEDIATELY, (err, result) => {
		if(err) {
			cb(err);
		}
		else if(result === "registered=0") {
			// client freshly initialized, no attempts to register, yet
			cb(null, false);
		}
		else if(result === "registered=-1") {
			// difficult case; when this happens, there may be multiple
			// linphonerc daemons running and interfering with each other
			// (port blocked?). easiest workaround: force current daemon
			// to exit. throwing an error here to signal the special case.
			cb(new Error("deregistered"));
		}
		else {
			cb(null, result && result.indexOf('registered, identity=') === 0);
		}
	});
}

function register(cb) {
	const cmd = `register --host ${cfg.sip.hostname} --username ${cfg.sip.username} --password ${cfg.sip.password}`;
	linphone(cmd, cfg.linphone.delay * 10, cb);
}

function isDialing(cb) {
	linphone('status hook', RETURN_IMMEDIATELY, (err, result) => {
		// When not dialing, the result is "hook=offhook"
		// When dialing, the result is ""
		// When in an outgoing call, the result is "Call out, [...]"
		cb(err, result === "");
	});
}

function isInCall(cb) {
	linphone('generic calls', RETURN_IMMEDIATELY, (err, result) => {
		cb(err, result && result.indexOf('No active call.') === -1);
	});
}

function initiateCall(cb) {
	const number = cfg.sip.dial;
	linphone(`dial ${number}`, cfg.linphone.delay, cb);
}

function terminateCalls(cb) {
	linphone('generic terminate all', cfg.linphone.delay, cb);
}

module.exports = {
	configure,
	exit,
	init,
	isInitialized,
	isRegistered,
	register,
	isDialing,
	isInCall,
	initiateCall,
	terminateCalls
};
