const gpio = require("rpi-gpio");

var config = undefined;

function setup(userConfig, cb /* (err) */) {

	config = userConfig;

	gpio.setup(config["button-pin"], gpio.DIR_IN, (err, data) => {
		cb(err || undefined);
	});
}

function isButtonPressed(cb /*err, value*/) {
	if(!config) {
		cb(new Error("not initialized"));
	}
	else {
		gpio.read(config["button-pin"], (err, value) => {
			if(err) {
				cb(err);
			}
			else {
				cb(null, value === config["button-pressed-state"]);
			}
		});
	}
}

module.exports = {
	setup,
	isButtonPressed
};
