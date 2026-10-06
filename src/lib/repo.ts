// Single source of truth for the CONTENT repo's GitHub identity on the client.
//
// Adapted from greatfallstoolbus.org/src/lib/repo.ts. There, the slug named the
// site's own repo; here The DSA Woodshed is a *reading surface* whose prose and
// reference sheets are authored and tracked in a separate content repo
// (DSA-Woodshed/dsa-study-packet). So the "edit this page" / "view source"
// affordances resolve against that repo, not this presentation repo.
//
// Every page-source URL in the app (SourceLink.svelte, the operator-docs link
// resolver in src/lib/docs/registry.ts) flows from the constants below, so no
// org/repo string is hand-inlined anywhere else.
export const REPO_SLUG = 'DSA-Woodshed/dsa-study-packet';

export const REPO_URL = `https://github.com/${REPO_SLUG}`;

/** Default branch the content is edited from. */
export const REPO_DEFAULT_BRANCH = 'main';

/**
 * GitHub web edit URL for a repo-relative source path in the content repo, e.g.
 * `editUrl('reference-sheets/03-algorithm-templates.md')`. Opens the in-browser
 * editor on the default branch so a reader can propose a fix and open a PR
 * without a local checkout.
 */
export function editUrl(sourcePath: string): string {
	const clean = sourcePath.replace(/^\//, '');
	return `${REPO_URL}/edit/${REPO_DEFAULT_BRANCH}/${clean}`;
}

/** GitHub web blob (read) URL for a repo-relative source path. */
export function blobUrl(sourcePath: string): string {
	const clean = sourcePath.replace(/^\//, '');
	return `${REPO_URL}/blob/${REPO_DEFAULT_BRANCH}/${clean}`;
}
