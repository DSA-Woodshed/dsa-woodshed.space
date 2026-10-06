export type PrimaryNavState = 'page' | 'location' | undefined;

export interface PrimaryNavLink {
	href: string;
	label: string;
	sections: string[];
	excludeSections?: string[];
}

export const PROJECT_ROUTE = '/project';

/** The source-of-truth contract page: an ordinary Method entry, but excluded
 * from Method's nav highlighting (see below) so it never doubles up with the
 * dedicated Project landing. */
export const SOURCE_OF_TRUTH_ROUTE = '/guide/source-of-truth';

export const PRIMARY_NAV_LINKS: PrimaryNavLink[] = [
	{ href: '/challenges', label: 'Practice', sections: ['/challenges'] },
	{
		href: '/library',
		label: 'Library',
		sections: ['/library', '/algorithms', '/reference', '/printables'],
	},
	{
		href: '/guide/getting-started',
		label: 'Method',
		sections: ['/guide'],
		excludeSections: [SOURCE_OF_TRUTH_ROUTE],
	},
	{ href: PROJECT_ROUTE, label: 'Project', sections: [PROJECT_ROUTE] },
];

export function isPathInSection(pathname: string, section: string): boolean {
	return pathname === section || pathname.startsWith(`${section}/`);
}

export function primaryNavState(pathname: string, link: PrimaryNavLink): PrimaryNavState {
	if (pathname === link.href) return 'page';
	if (link.excludeSections?.some((section) => isPathInSection(pathname, section))) return undefined;
	return link.sections.some((section) => isPathInSection(pathname, section)) ? 'location' : undefined;
}
