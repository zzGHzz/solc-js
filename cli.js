#!/usr/bin/env node

var fs = require('fs');
var https = require('follow-redirects').https;
var MemoryStream = require('memorystream');
var keccak256 = require('js-sha3').keccak256;
var commander = require('commander');

var program = new commander.Command();
program
	.option('-u, --use <version>', 'Use the chosen version of solidity.')
	.option('-d, --download <version>', 'Download the chosen version of solidity');
program.parse(process.argv);

function getVersionList(cb) {
	console.log('Retrieving available version list...');

	var mem = new MemoryStream(null, { readable: false });
	https.get('https://solc-bin.ethereum.org/bin/list.json', function (response) {
		if (response.statusCode !== 200) {
			console.log('Error downloading file: ' + response.statusCode);
			process.exit(1);
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
		console.log('Interrupted, removing file.');
		fs.unlinkSync(outputName);
		process.exit(1);
	});

	var file = fs.createWriteStream(outputName, { encoding: 'binary' });
	https.get('https://solc-bin.ethereum.org/bin/' + version, function (response) {
		if (response.statusCode !== 200) {
			console.log('Error downloading file: ' + response.statusCode);
			process.exit(1);
		}
		response.pipe(file);
		file.on('finish', function () {
			file.close(function () {
				var hash = '0x' + keccak256(fs.readFileSync(outputName, { encoding: 'binary' }));
				if (expectedHash !== hash) {
					console.log('Hash mismatch: ' + expectedHash + ' vs ' + hash);
					process.exit(1);
				}
				console.log('Done.');
			});
		});
	});
}

if (program.download) {
	if (program.download.match(/^(\d+\.\d+\.\d+)$/) === null) {
		console.log('Invalid version number');
		process.exit(1)
	}

	var wanted = program.download;

	getVersionList(function (list) {
		list = JSON.parse(list);
		var releaseFileName = list.releases[wanted];
		var expectedFile = list.builds.filter(function (entry) { return entry.path === releaseFileName; })[0];
		if (!expectedFile) {
			console.log('Version not found');
			process.exit(1);
		}
		var expectedHash = expectedFile.keccak256;

		var dir = './versions/'
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}

		var file = './versions/' + releaseFileName;
		if (fs.existsSync(file)) {
			console.log(`Version ${wanted} already downloaded.`);
			process.exit(1);
		}

		downloadBinary(file, releaseFileName, expectedHash);
	});
}

if (program.use) {
	if (program.use.match(/^(\d+\.\d+\.\d+)$/) === null) {
		console.log('Invalid version number');
		process.exit(1)
	}

	var wanted = program.use;

	var dir = './versions/';
	var isFileExist = false;
	fs.readdirSync(dir).forEach(file => {
		if (file.includes(wanted)) {
			isFileExist = true;
			fs.copyFile('./versions/' + file, './soljson.js', (err) => {
				if (err)
					console.log(err);
				else
					console.log(`Version ${wanted} loaded.`)
			});
		}
	});

	if (!isFileExist) {
		console.log('Version not found. Please download first')
	}
}