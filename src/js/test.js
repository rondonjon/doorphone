const timers = require("timers");
const LinPhone = require("./LinPhone.js");
const config = require("./config.json");

const lp = new LinPhone(config.linphone);
lp.start();

timers.setTimeout(() => {
	lp.register(config.sip.username, config.sip.hostname, config.sip.password);
}, 1000);
