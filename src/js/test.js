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

function handleButton() {

	const s = lp.getState();

	if(s.isDialing || s.isInCall) {
		lp.hangup();
	}
	else if (s.isRegistered) {
		lp.dial(config.sip.dial);
	}
}

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

				const now = new Date();
				lastButtonPressedState = isPressed;

				if(isPressed && now >= ignoreButtonDownUntil) {
					// throttle/ignore further button presses for <configured duration>
					ignoreButtonDownUntil = now + config.runtime.durationButtonThrottle;
					// initiate a call
					handleButton();
				}
			}
		})
	}, config.runtime.intervalReadButtonState);
});
