/** Layout-scoped launcher for the one session chooser shared by every route. */
export const SESSION_DIALOG_CONTEXT = Symbol('woodshed-session-dialog');
export type SessionLauncher = (trigger?: HTMLElement) => void;
