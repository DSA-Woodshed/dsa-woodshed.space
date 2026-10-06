// This SITE's own GitHub identity — deliberately separate from $lib/repo,
// whose REPO_SLUG/REPO_URL point at the *content* repo (dsa-study-packet).
// The footer's build-provenance link (see $lib/build-info + +layout.svelte)
// needs to resolve against the commit that built and deployed *this*
// presentation repo, so it gets its own tiny constant instead of overloading
// $lib/repo's meaning.
export const SITE_REPO_SLUG = 'DSA-Woodshed/dsa-woodshed.space';

export const SITE_REPO_URL = `https://github.com/${SITE_REPO_SLUG}`;
