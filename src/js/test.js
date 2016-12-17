const timers = require("timers");
const LinPhone = require("./LinPhone.js");
const gpio = require("./gpio.js");
const config = require("./config.json");

const lp = new LinPhone(config.linphone);
lp.start();

let ignoreButtonDownUntil = new Date();
let lastButtonPressedState = false;

function register() {
	if(lp.getState().isRegistered === false) {
		lp.register(config.sip.username, config.sip.hostname, config.sip.password);
	}
}

function throttle(fn, duration) {
	let blockedUntil = undefined;
	return function() {
		const now = new Date();
		if(!blockedUntil || now >= blockedUntil) {
			blockedUntil = now + duration;
			return fn.apply(null, arguments);
		}
	};
}

function handleButton() {

	const s = lp.getState();

	if(s.isDialing || s.isInCall) {
		lp.hangup();
	}
	else if (s.isRegistered) {
		lp.dial(config.sip.dial);
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
