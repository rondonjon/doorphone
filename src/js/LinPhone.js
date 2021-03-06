const stream = require("stream");
const spawn = require("child_process").spawn;
const timers = require("timers");

/*
 * This class transforms linphonec's unstructured stdout stream
 * into structured command objects { request: '...', response: '...' }.
 *
 * To do do, the Transform buffers the stdout content and searches for
 * texts between two linphonec prompts. The content of the first line
 * is known to be the command, whereas the following content is treated
 * as the response.
 */
class OutTransform extends stream.Transform {

	constructor(options) {
		super(options);
		this.str = '';
	}

	_transform(data, encoding, callback) {

		const that = this;
		that.str += data.toString();

		function handler(all, request, response) {
			that.push(JSON.stringify({
				'request': request,
				'response': response.trim()
			}));
			return 'linphonec> ';
		}

		for(;;) {
			// find combinations of request & response
			// between every two 'linphonec> ' prompts
			let v = that.str.replace(/linphonec>      (.*)\n([^]*?)linphonec> /m, handler);
			if(v === that.str) {
				break;
			}
			that.str = v;
		}

		callback();
	}
}

/*
 * A (simple, very limited) wrapper for the LinPhone client application.
 *
 * The client is spawned in a child process, and all communication is handled
 * through the stdin/stdout streams.
 *
 * All readable/state information should be retrieved through getState().
 *
 * The "writing" operations apply "fire and forget", i.e. they will not return any
 * success or state information; the calling application will need to observe
 * the state changes to understand if a submitted command has succeeded.
 */
class LinPhoneImpl {

	constructor(options) {

		this.config = Object.assign(
			{},
			{
				runtimeInterval: 50,
				logCommands: true,
				logState: true,
				logStateChanges: true,
				executable: 'linphonec',
				autoanswer: true,
				args: []
			},
			options || {}
		);

		this.linphone = undefined;
		this.state = this.createState();
		this.runtimeTimeout = undefined;
	}

	createState() {
		return {
			isRegistered: undefined,
			isDialing: undefined,
			isInCall: undefined
		};
	}

	start() {

		const that = this;

		that.linphone = spawn(that.config.executable, that.config.args);

		that.linphone.stdout.pipe(new OutTransform()).on('data', data => {
			const str = data.toString();
			const cmd = JSON.parse(str);
			that.handleCommand(cmd);
		});

		that.linphone.on('close', () => that.handleClose());

		that.runtimeTimeout = timers.setTimeout(() => that.runtimeLoop(), 500);
	}

	stop() {
		this.request("quit");
	}

	handleCommand(command) {

		const that = this;
		const req = command.request;
		const resp = command.response;

		if(that.config.logCommands) {
			console.log("[command]", JSON.stringify(command));
		}

		const changes = {};

		if(req === 'status register') {
			if(resp === 'registered=0') {
				// never registered
				changes.isRegistered = false;
				changes.isDialing = false;
				changes.isInCall = false;
			}
			else if(resp === 'registered=-1') {
				// registration failed or de-registered
				changes.isRegistered = false;
				changes.isDialing = false;
				changes.isInCall = false;
			}
			else if(resp.startsWith('registered, identity=')) {
				// registered
				changes.isRegistered = true;
			}
		}

		if(req === 'status hook') {
			if(resp === 'hook=offhook') {
				changes.isDialing = false;
				changes.isInCall = false;
			}
			else if(resp.startsWith('Call out, ')) {
				changes.isDialing = false;
				changes.isInCall = true;
			}
			else {
				changes.isDialing = true;
				changes.isInCall = false;
			}
		}

		Object.keys(changes).forEach(key => {
			if(changes[key] !== that.state[key]) {
				if(that.config.logStateChanges) {
					console.log("[state change]", `${key}: ${this.state[key]} => ${changes[key]}`);
				}
				that.state[key] = changes[key];
				if(key === "isRegistered" && changes[key] === true) {
					that.handleRegistration();
				}
			}
		});
	}

	handleClose() {

		// cancel the runtime loop
		if(this.runtimeTimeout !== undefined) {
			timers.clearTimeout(this.runtimeTimeout);
			this.runtimeTimeout = undefined;
		}

		// reset state
		this.linphone = undefined;
		this.state = this.createState();

		// spawn a new client
		this.start();
	}

	handleRegistration() {
		if(this.config.autoanswer === true) {
			this.request("autoanswer enable");
		}
		else {
			this.request("autoanswer disable");
		}
	}

	request(command) {
		this.linphone.stdin.write(`     ${command}\n`);
	}

	runtimeLoop() {

		if(this.config.logState) {
			console.log("[state]", JSON.stringify(this.state));
		}

		if(this.linphone) {
			this.request('status register');
			this.request('status hook');
		}

		this.runtimeTimer = timers.setTimeout(() => this.runtimeLoop(), this.config.runtimeInterval);
	}

	register(username, hostname, password) {
		this.request(`register ${username} ${hostname} ${password}`);
	}

	dial(number) {
		this.request(`call ${number}`);
	}

	hangup() {
		this.request("terminate all");
	}

	getState() {
		return Object.assign({}, this.state);
	}
}

/*
 * A small wrapper with a stable API to hide the implementing class above.
 */
class LinPhone {

	constructor(config) {
		const impl = new LinPhoneImpl(config);
		const that = this;

		['start', 'stop', 'dial', 'hangup', 'register', 'getState'].forEach(fn => {
			that[fn] = function() {
				return impl[fn].apply(impl, arguments);
			};
		});
	}
}

module.exports = LinPhone;
