const timers = require("timers");
const LinPhone = require("./LinPhone.js");
const gpio = require("./gpio.js");
const config = require("../json/config.json");

const lp = new LinPhone(config.linphone);
lp.start();

let lastButtonPressedState = false;

function register() {
	if(lp.getState().isRegistered === false) {
		lp.register(config.sip.username, config.sip.hostname, config.sip.password);
	}
}

function throttle(fn, duration) {
	let blockedUntil = new Date();
	return function() {
		const now = new Date();

		if(now < blockedUntil) {
			if(config.runtime.logButtonThrottles) {
				console.log("[runtime] function still throttled; skipping action");
			}
			return;
		}

		blockedUntil = new Date(now.getTime() + duration);
		return fn.apply(null, arguments);
	};
}

function handleButton() {

	const s = lp.getState();

	if(s.isDialing || s.isInCall) {
		if(config.runtime.logButtonActions) {
			console.log("[runtime] hanging up");
		}
		lp.hangup();
	}
	else if (s.isRegistered) {
		const number = config.sip.dial;
		if(config.runtime.logButtonActions) {
			console.log(`[runtime] dialing ${number}`);
		}
		lp.dial(number);
	}
	else {
		if(config.runtime.logButtonActions) {
			console.log(`[runtime] no action`);
		}
	}
}

const handleButtonThrottled = throttle(handleButton, config.runtime.durationButtonThrottle);

timers.setTimeout(() => {
	// First-time registration
	register();
	// Interval for automatic re-registration
	timers.setInterval(register, config.runtime.intervalCheckRegistration);
}, config.runtime.delayFirstRegistration);

gpio.setup(config.gpio, () => {
	timers.setInterval(() => {
		gpio.isButtonPressed((err, isPressed) => {

			if(isPressed !== lastButtonPressedState) {

				if(config.runtime.logButtonStateChanges) {
					const label = { true: 'down', false: 'up' };
					console.log(`[runtime] button state changed ${label[lastButtonPressedState]} => ${label[isPressed]}`);
				}

				lastButtonPressedState = isPressed;
				handleButtonThrottled();
			}
		})
	}, config.runtime.intervalReadButtonState);
});
