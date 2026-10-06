import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { CapabilityInventory } from './capabilities';

const inventory = JSON.parse(
	readFileSync(new URL('../../static/capabilities.json', import.meta.url), 'utf8'),
) as CapabilityInventory;
vi.stubGlobal('__CAPABILITY_INVENTORY__', inventory);
const { availableCapabilities, MAX_SESSION_MINUTES, sessionCommand } = await import('./capabilities');
const algorithm = availableCapabilities.find((entry) => entry.kind === 'algorithm')!;
const reading = availableCapabilities.find((entry) => entry.modes.includes('read'))!;
afterAll(() => vi.unstubAllGlobals());

describe('canonical session command handoff', () => {
	it('supports the canonical maximum custom budget without electing readiness', () => {
		expect(MAX_SESSION_MINUTES).toBe(1440);
		expect(sessionCommand(algorithm, 'implement', MAX_SESSION_MINUTES)).toBe(
			`just session start ${algorithm.id} --mode implement --minutes 1440`,
		);
	});

	it.each(['implement', 'tests-first'])('adds readiness only when elected for %s', (mode) => {
		expect(sessionCommand(algorithm, mode, 30)).not.toContain('--ready');
		expect(sessionCommand(algorithm, mode, 30, true)).toBe(
			`just session start ${algorithm.id} --mode ${mode} --minutes 30 --ready`,
		);
	});

	it('refuses readiness for a reading activity', () => {
		expect(() => sessionCommand(reading, 'read', 15, true)).toThrow(/readiness/);
	});

	it.each([0, -1, 1441, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses invalid budget %s', (minutes) => {
		expect(() => sessionCommand(algorithm, 'study', minutes)).toThrow(/minutes/);
	});

	it('refuses an activity outside the published inventory and a mode outside the selected material', () => {
		expect(() => sessionCommand({ ...reading, id: 'reference/unknown' }, 'read', 15)).toThrow(/available/);
		expect(() => sessionCommand(reading, 'implement', 15)).toThrow(/supported mode/);
	});
});
