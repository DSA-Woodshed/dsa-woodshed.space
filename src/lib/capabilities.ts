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

export function sessionCommand(capability: Capability, mode: string, minutes: number): string {
	if (!availableCapabilities.some((entry) => entry.id === capability.id) || !capability.modes.includes(mode)) {
		throw new Error('Choose an available capability and supported mode.');
	}
	if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 480) throw new Error('Choose 1–480 minutes.');
	if (!/^[a-z0-9][a-z0-9_./-]*$/.test(capability.id) || !/^[a-z-]+$/.test(mode)) {
		throw new Error('The catalog contains an invalid session identifier.');
	}
	return `just session start ${capability.id} --mode ${mode} --minutes ${minutes}`;
}
