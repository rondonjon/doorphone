"use strict";

const timers = require("timers");
const exec = require("child_process").exec;

var cfg = undefined;

function configure(config) {
	cfg = config;
}

function linphone(args, delay, cb) {

	const cmdline = `${cfg.linphone.cmd} ${args}`;
	const verbose = cfg.linphone.verbose === true;

	if (verbose) {
		console.log(`[linphone] exec: ${cmdline}`)
	}

	exec(cmdline, (err, stdout, stderr) => {

		const output = stdout && stdout.toString().trim() || '';

		if (verbose) {
			console.error(`[linphone] result: ${output}`);
		}

		timers.setTimeout(() => cb(output), delay);
	});
}

function exit(cb) {
	linphone('exit', cfg.linphone.delay, cb);
}

function init(cb) {
	linphone('init', cfg.linphone.delay, cb);
}

function isInitialized(cb) {
	linphone('status register', 0, (err, result) => {
		cb(err, !!result);
	});
}

function isRegistered(cb) {
	linphone('status register', 0, (err, result) => {
		cb(err, result === 'registered=1');
	});
}

function register(cb) {
	linphone(`register --host ${cfg.sip.hostname} --username ${cfg.sip.username} --password ${cfg.sip.password}`, cfg.linphone.delay, cb);
}

function isDialing(cb) {
	cb(new Error('not implemented yet'));
}

function isInCall(cb) {
	linphone('generic calls', 0, (err, result) => {
		cb(err, result && result.indexOf('No active call.') === -1);
	});
}

function initiateCall(cb) {
	const number = cfg.sip.dial;
	linphone(`generic call ${number}`, cfg.linphone.delay, cb);
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
