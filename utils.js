var path = require('path');
var fs = require('fs');
var exec = require('child_process').execSync;

var getPackagePath = () => {
	var name = '@pzzh/solc';
	var dirs = require.resolve.paths(name);
	for (var dir of dirs) {
		if (fs.existsSync(path.join(dir, name))) {
			return path.join(dir, name);
		}
	}

	try {
		var globalPath = exec('npm root -g').toString().trim();
		if (fs.existsSync(path.join(globalPath, name))) {
			return path.join(globalPath, name);
		} else { return null; }
	} catch (err) {
		return null;
	}
}

module.exports = {
	getPackagePath
}