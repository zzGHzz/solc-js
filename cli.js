#!/usr/bin/env node

var fs = require('fs');
var https = require('follow-redirects').https;
var MemoryStream = require('memorystream');
var keccak256 = require('js-sha3').keccak256;
var commander = require('commander');
var path = require('path');

var utils = require('./utils.js');

var program = new commander.Command();
program
	.option('-u, --use <version>', 'Use the chosen version of solidity.')
	.option('-d, --download <version>', 'Download the chosen version of solidity');
program.parse(process.argv);

function abort(msg) {
	console.error(msg || 'Error occured');
	process.exit(1);
}

function getVersionList(cb) {
	console.log('Retrieving available version list...');

	var mem = new MemoryStream(null, { readable: false });
	https.get('https://solc-bin.ethereum.org/bin/list.json', function (response) {
		if (response.statusCode !== 200) {
			abort('Error downloading file: ' + response.statusCode);
		}
		response.pipe(mem);
		response.on('end', function () {
			cb(mem.toString());
		});
	});
}

function downloadBinary(outputName, version, expectedHash) {
	console.log('Downloading version', version);

	// Remove if existing
	if (fs.existsSync(outputName)) {
		fs.unlinkSync(outputName);
	}

	process.on('SIGINT', function () {
		fs.unlinkSync(outputName);
		abort('Interrupted, removing file.');
	});

	var file = fs.createWriteStream(outputName, { encoding: 'binary' });
	https.get('https://solc-bin.ethereum.org/bin/' + version, function (response) {
		if (response.statusCode !== 200) {
			abort('Error downloading file: ' + response.statusCode);
		}
		response.pipe(file);
		file.on('finish', function () {
			file.close(function () {
				var hash = '0x' + keccak256(fs.readFileSync(outputName, { encoding: 'binary' }));
				if (expectedHash !== hash) {
					abort('Hash mismatch: ' + expectedHash + ' vs ' + hash);
				}
				console.log('Done.');
			});
		});
	});
}

if (program.download) {
	if (program.download.match(/^(\d+\.\d+\.\d+)$/) === null) {
		abort('Invalid version number');
	}

	var wanted = program.download;

	getVersionList(function (list) {
		list = JSON.parse(list);
		var releaseFileName = list.releases[wanted];
		var expectedFile = list.builds.filter(function (entry) { return entry.path === releaseFileName; })[0];
		if (!expectedFile) {
			abort(`Version ${wanted} not found`);
		}
		var expectedHash = expectedFile.keccak256;

		// var pkgDir = './node_modules/' + package.name;
		var pkgDir = utils.getPackagePath();
		if (!pkgDir) {
			abort('Package directory not found.');
		}

		var verDir = path.join(pkgDir, 'versions')
		if (!fs.existsSync(verDir)) {
			fs.mkdirSync(verDir);
		}

		var file = path.join(verDir, releaseFileName);
		if (fs.existsSync(file)) {
			abort(`Version ${wanted} already downloaded.`);
		}

		downloadBinary(file, releaseFileName, expectedHash);
	});
}

if (program.use) {
	if (program.use.match(/^(\d+\.\d+\.\d+)$/) === null) {
		abort('Invalid version number');
	}

	var wanted = program.use;

	// var pkgDir = './node_modules/' + package.name;
	var pkgDir = utils.getPackagePath();
	if (!pkgDir) {
		abort('Package not found.');
	}

	var verDir = path.join(pkgDir, 'versions');
	if (!fs.existsSync(verDir)) {
		abort(`Version ${wanted} not found. To download the version, use command
  solcver --download <VERSION>`);
	}

	var isFileExist = false;
	fs.readdirSync(verDir).forEach(file => {
		if (file.includes(wanted)) {
			isFileExist = true;
			fs.copyFile(path.join(verDir, file), path.join(pkgDir, 'soljson.js'), (err) => {
				if (err)
					abort(`Version ${wanted} not found. To download the version, use command
  solcver --download <VERSION>`);
				else
					console.log(`Version ${wanted} loaded.`);
			});
		}
	});

	if (!isFileExist) {
		abort(`Version ${wanted} not found. To download the version, use command
  solcver --download <VERSION>`)
	}
}