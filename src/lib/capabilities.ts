export interface Capability {
	id: string;
	kind: string;
	title: string;
	source: string;
	modes: string[];
	duration: number;
	entrypoint: string;
	availability: 'available' | 'unavailable';
}
export interface CapabilityInventory {
	schema: 1;
	counts: Record<string, number>;
	capabilities: Capability[];
}
// Vite injects the same published JSON that the packet lock verifies.
declare const __CAPABILITY_INVENTORY__: CapabilityInventory;
export const capabilities = __CAPABILITY_INVENTORY__.capabilities;
export const availableCapabilities = capabilities.filter((capability) => capability.availability === 'available');
export const MAX_SESSION_MINUTES = 1440;

export function sessionCommand(capability: Capability, mode: string, minutes: number, ready = false): string {
	const canonical = availableCapabilities.find((entry) => entry.id === capability.id);
	if (!canonical || !canonical.modes.includes(mode)) {
		throw new Error('Choose an available capability and supported mode.');
	}
	if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > MAX_SESSION_MINUTES) {
		throw new Error(`Choose 1–${MAX_SESSION_MINUTES} minutes.`);
	}
	if (ready && !['implement', 'tests-first'].includes(mode)) {
		throw new Error('Choose readiness only when moving to candidate work.');
	}
	if (!/^[a-z0-9][a-z0-9_./-]*$/.test(canonical.id) || !/^[a-z-]+$/.test(mode)) {
		throw new Error('The catalog contains an invalid session identifier.');
	}
	return `just session start ${canonical.id} --mode ${mode} --minutes ${minutes}${ready ? ' --ready' : ''}`;
}
