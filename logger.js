const ora = require('ora');
const chalk = require('chalk');

const spinner = ora();

class Logger {

	constructor(className) {
		this._debugLog = console.debug;
		this._log = console.log;
		this._errorLog = console.error;
		this._silent = false;
		this.className = className ? (className + '-') : '';
		this.errorPrefix = '[' + this.className + 'E] ';
		this.warnPrefix = '[' + this.className + 'W] ';
		this.infoPrefix = '[' + this.className + 'I] ';
		this.debugPrefix = '[' + this.className + 'D] ';
	}

	setSilent(silent) {
		this._silent = silent;
	}

	error(msg) {
		this._errorLog('  ' + this.errorPrefix + chalk.bold.red(msg));
	}

	warning(msg) {
		this._log('  ' + this.warnPrefix + chalk.bold.orange(msg));
	}

	info(msg) {
		if (this._silent) {
			return;
		}
		if (msg instanceof Object) {
			this._log('  ' + this.infoPrefix + ':');
			this._log(msg);
		} else {
			this._log('  ' + this.infoPrefix + msg);
		}
	}

	debug(msg) {
		if (this._silent) {
			return;
		}
		if (msg instanceof Object) {
			this._debugLog('  ' + this.debugPrefix + ':');
			this._debugLog(chalk.yellow(msg));
		} else {
			this._debugLog('  ' + this.debugPrefix + chalk.yellow(msg));
		}
	}

	spinner() {
		const self = this;
		return {
			start: (text) => {
				if (this._silent) {
					return spinner;
				}
				return spinner.start(text ? (self.infoPrefix + text) : undefined);
			},
			info: (text) => {
				if (this._silent) {
					return spinner;
				}
				return spinner.info(text ? (self.infoPrefix + text) : undefined);
			},
			text: (text) => {
				if (this._silent) {
					return spinner;
				}
				spinner.text = self.infoPrefix + text;
			},
			fail: (text) => {
				if (this._silent) {
					return spinner;
				}
				return spinner.fail(text ? (self.infoPrefix + chalk.red(text)) : undefined);
			},
			succeed: (text) => {
				if (this._silent) {
					return spinner;
				}
				return spinner.succeed(text ? (self.infoPrefix + chalk.green(text)) : undefined);
			},
			clear: () => {
				if (this._silent) {
					return spinner;
				}
				return spinner.clear();
			}
		}
	}
}

module.exports = (className) => {return new Logger(className);};
