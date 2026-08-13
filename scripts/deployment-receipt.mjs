// Build and verify the public receipt that binds one Pages deployment to the
// exact site commit, packet commit, and printable digest it serves.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPacketLock } from './packet-lock.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const FULL_SHA = /^[0-9a-f]{40}$/;

function requireSiteCommit(value) {
	if (!FULL_SHA.test(value)) throw new Error(`site commit must be a lowercase 40-character SHA: ${value}`);
	return value;
}

export function expectedReceipt(siteCommit, manifestPath) {
	const lock = readPacketLock(manifestPath);
	return {
		schemaVersion: 1,
		siteCommit: requireSiteCommit(siteCommit),
		packetRepo: lock.sourceRepo,
		packetCommit: lock.sourceCommit,
		bookletDigest: lock.booklet.asset.digest,
	};
}

export function parseReceipt(text, manifestPath) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error('deployment receipt is not valid JSON');
	}
	if (JSON.stringify(value) !== JSON.stringify(expectedReceipt(value.siteCommit, manifestPath))) {
		throw new Error('deployment receipt does not match the committed packet lock');
	}
	return value;
}

export function writeReceipt(outputPath, siteCommit, manifestPath) {
	const receipt = expectedReceipt(siteCommit, manifestPath);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, JSON.stringify(receipt, null, '\t') + '\n');
	return receipt;
}

export async function verifyReceiptUrl(url, siteCommit, options = {}) {
	const expected = expectedReceipt(siteCommit, options.manifestPath);
	const fetchImpl = options.fetchImpl ?? fetch;
	const attempts = options.attempts ?? 12;
	const delayMs = options.delayMs ?? 5_000;
	let last = 'no response';
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const response = await fetchImpl(url, { headers: { 'Cache-Control': 'no-cache' }, cache: 'no-store' });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const observed = JSON.parse(await response.text());
			if (JSON.stringify(observed) === JSON.stringify(expected)) return observed;
			last = `receipt mismatch: ${JSON.stringify(observed)}`;
		} catch (error) {
			last = error instanceof Error ? error.message : String(error);
		}
		if (attempt < attempts) await delay(delayMs);
	}
	throw new Error(`production did not serve the expected deployment receipt: ${last}`);
}

async function main(args) {
	const [command, first, second] = args;
	if (command === '--write' && first && second) {
		const receipt = writeReceipt(resolve(first), second);
		console.log(`deployment-receipt: wrote ${receipt.siteCommit} @ ${receipt.packetCommit}`);
		return;
	}
	if (command === '--verify-url' && first && second) {
		const receipt = await verifyReceiptUrl(first, second);
		console.log(`deployment-receipt: live ${receipt.siteCommit} @ ${receipt.packetCommit}`);
		return;
	}
	throw new Error('usage: deployment-receipt.mjs --write <path> <site-sha> | --verify-url <url> <site-sha>');
}

if (resolve(process.argv[1] ?? '') === THIS_FILE) {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? `deployment-receipt: ${error.message}` : error);
		process.exitCode = 1;
	}
}
