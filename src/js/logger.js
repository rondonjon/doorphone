const path = require("path");

//const filelogger = require("file-logger"); <- dropped in favor of PM2 logging

function init(config) {
	//const file = path.resolve(path.join(__dirname, "../../", config.filename));
	//filelogger(file);
}

function log() {
	console.log.apply(console, arguments);
}

module.exports = {
	init,
	log
};
