#!/usr/bin/env node

var fs = require('fs');
var https = require('follow-redirects').https;
var MemoryStream = require('memorystream');
var keccak256 = require('js-sha3').keccak256;
var commander = require('commander');
var path = require('path');
var semver = require('semver');

var utils = require('./utils.js');

var program = new commander.Command();
program
	.option('-u, --use <version>|latest', 'Use the chosen version of solidity.')
	.option('-d, --download <version>|newest', 'Download the chosen version of solidity')
	.option('-l, --list', 'List all the downloaded an available compiler versoins')
	.option('--latest', 'Download and use the lastest compiler version')
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

function downloadBinaryAndUse(outputName, version, expectedHash) {
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

				var tgt = path.resolve(path.dirname(outputName), '../soljson.js');
				if (fs.existsSync(tgt)) {
					fs.unlinkSync(tgt);
				}
	
				fs.copyFile(outputName, tgt, (err) => {
					if (err)
						abort(`Fail to load version ${version}`);
					else
						console.log(`Version ${version} loaded.`);
				});
			});
		});
	});
}

if (program.download) {
	if (program.download.match(/^(\d+\.\d+\.\d+)$/) === null && program.download !== 'latest') {
		abort('Invalid version number');
	}

	var wanted = program.download;

	getVersionList(function (list) {
		list = JSON.parse(list);

		if (wanted === 'latest') {
			wanted = list.latestRelease;
		}

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
	if (semver.valid(program.use) === null && program.use !== 'newest') {
		abort('Invalid version number');
	}

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

	// console.log(verDir);

	var wanted = program.use;
	if (wanted === 'newest') {
		fs.readdirSync(verDir).forEach(file => {
			if (file.match(/(\d+\.\d+\.\d+)/) === null) {
				return;
			}
			var ver = file.match(/(\d+\.\d+\.\d+)/)[0];
			
			if (wanted === 'newest') {
				wanted = ver;
			} else if (semver.gt(ver, wanted)) {
				wanted = ver;
			}
		})
	}

	// console.log(`wanted = ${wanted}`)

	var isFileExist = false;
	fs.readdirSync(verDir).forEach(file => {
		if (file.includes(wanted)) {
			isFileExist = true;
			
			var tgt = path.join(pkgDir, 'soljson.js');
			if (fs.existsSync(tgt)) {
				fs.unlinkSync(tgt);
			}

			fs.copyFile(path.join(verDir, file), tgt, (err) => {
				if (err)
					abort(`Fail to load version ${version}`);
				else
					console.log(`Version ${wanted} loaded.`);
			});
		}
	});

	if (!isFileExist) {
		abort(`Version ${wanted} not found. To download the version, use command
  solcver --download <VERSION>`)
	}

	process.exit(1);
}

if (program.list) {
	var pkgDir = utils.getPackagePath();
	if (!pkgDir) {
		abort('None');
	}

	var verDir = path.join(pkgDir, 'versions');
	if (!fs.existsSync(verDir)) {
		abort(`None`);
	}

	var count = 0;
	fs.readdirSync(verDir).forEach(file => {
		if (file.match(/(\d+\.\d+\.\d+)/) !== null) {
			console.log(file.match(/(\d+\.\d+\.\d+)/)[0]);
			count = count + 1;	
		}
	})

	if (count == 0) {
		abort('None');
	}

	process.exit(1);
}

if (program.latest) {
	var wanted = 'latest';

	getVersionList(function (list) {
		list = JSON.parse(list);

		if (wanted === 'latest') {
			wanted = list.latestRelease;
		}

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
			fs.unlinkSync(file);
		}

		downloadBinaryAndUse(file, releaseFileName, expectedHash);
	});
}