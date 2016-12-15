const stream = require("stream");
const spawn = require("child_process").spawn;
const timers = require("timers");

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
				request,
				response
			}));
			return 'linphonec> ';
		}

		for(;;) {
			// find combinations of request & response
			// between every two 'linphonec> ' prompts
			let v = that.str.replace(/linphonec> (.*)\n([^]*?)\nlinphonec> /m, handler);
			if(v === that.str) {
				break;
			}
			that.str = v;
		}

		callback();
	}
}

class LinPhoneImpl {

	constructor(options) {

		this.config = Object.assign(
			{},
			{
				runtimeInterval: 50,
				logCommands: true,
				logState: true,
				logStateChanges: true,
				executable: 'linphonec'
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

		that.linphone = spawn(that.config.executable);

		that.linphone.stdout.pipe(new OutTransform()).on('data', data => {
			const str = data.toString();
			const cmd = JSON.parse(str);
			that.handleCommand(cmd);
		});

		that.linphone.on('close', () => that.handleClose());

		that.runtimeTimeout = timers.setTimeout(() => that.runtimeLoop(), 500);
	}

	handleCommand(command) {

		const req = command.request;
		const resp = command.response;

		if(this.config.logCommands) {
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
			else if(line.startsWith('Call out, ')) {
				changes.isDialing = false;
				changes.isInCall = true;
			}
		}

		Object.keys(changes).forEach(key => {
			if(changes[key] !== this.state[key]) {
				if(this.config.logStateChanges) {
					console.log("[state change]", `${key}: ${this.state[key]} => ${changes[key]}`);
				}
				this.state[key] = changes[key];
			}
		})
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

	runtimeLoop() {

		if(this.config.logState) {
			console.log("[state]", JSON.stringify(this.state));
		}

		if(this.linphone) {
			this.linphone.stdin.write('status register\n');
			if(this.state.isRegistered) {
				this.linphone.stdin.write('status hook\n');
				//this.linphone.stdin.write('calls\n');
			}
		}

		this.runtimeTimer = timers.setTimeout(() => this.runtimeLoop(), this.config.runtimeInterval);
	}

	register() {

	}

	dial() {

	}

	terminateCalls() {

	}

	getState() {
		return Object.assign({}, this.state);
	}
}

class LinPhone {

	constructor(config) {
		this._impl = new LinPhoneImpl(config);
	}

	start() {
		return this._impl.start();
	}

	dial(number) {
		return this._impl.dial(number);
	}

	terminateCalls() {
		return this._impl.terminateCalls();
	}

	register() {
		return this._impl.register();
	}

	getState() {
		return this._impl.getState();
	}
}

module.exports = LinPhone;
