import { expect, test } from '@playwright/test';
import { openProductPage } from './page-load';

// Static scaffold regression guard: no document-level horizontal overflow at
// canonical breakpoints, and every same-page hash link on the home route
// resolves to an actual element.

const breakpoints = [
	{ label: 'mobile-min', width: 320, height: 1200 },
	{ label: 'mobile-small', width: 390, height: 1200 },
	{ label: 'mobile-large', width: 430, height: 1200 },
	{ label: 'tablet', width: 768, height: 1200 },
	{ label: 'desktop', width: 1440, height: 1200 },
];

// Content routes gained the IA nav shell (persistent sidebar at `lg`, a
// per-page TOC rail at `xl`). Check them at the same breakpoints so a future
// layout change here gets the same overflow guard the home page has.
const routes = [
	'/',
	'/library',
	'/challenges',
	'/printables',
	'/reference',
	'/reference/algorithm-templates',
	'/guide/interview-practice-evidence',
	// pymdownx-heavy raw-lane pages: stacked content tabs, admonitions, and
	// indented tables are the widest constructs the renderer emits.
	'/guide/getting-started',
	'/guide/learning-paths',
	'/guide/source-of-truth',
	'/guide/when-to-use-what',
	'/project',
	'/agent',
];

for (const bp of breakpoints) {
	for (const route of routes) {
		test(`${route} has no document overflow at ${bp.label} (${bp.width}px)`, async ({ page }) => {
			await page.setViewportSize({ width: bp.width, height: bp.height });
			await openProductPage(page, route);
			const { scrollWidth, innerWidth } = await page.evaluate(() => ({
				scrollWidth: document.documentElement.scrollWidth,
				innerWidth: window.innerWidth,
			}));
			// Tolerate up to 1px subpixel rounding; anything beyond means real overflow.
			expect(scrollWidth, `${route} ${bp.label} document overflow`).toBeLessThanOrEqual(innerWidth + 1);
		});
	}
}

test('home-route same-page hash links all resolve to an element', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const broken = await page.evaluate(() => {
		const hashes = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
			.map((a) => a.getAttribute('href') ?? '')
			.filter((h) => h.startsWith('/#') || h.startsWith('#'))
			.map((h) => (h.startsWith('/#') ? h.slice(1) : h));
		const unique = Array.from(new Set(hashes));
		return unique.filter((h) => h.length > 1 && !document.querySelector(h));
	});
	expect(broken, 'home-route hash targets without matching element').toEqual([]);
});

test('cross-page fragment links from home resolve on their target pages', async ({ page }) => {
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const fragmentLinks = await page.evaluate(() =>
		Array.from(
			new Set(
				Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
					.map((a) => a.getAttribute('href') ?? '')
					.filter((h) => h.startsWith('/') && !h.startsWith('/#') && h.includes('#')),
			),
		),
	);
	expect(fragmentLinks, 'expected the Extended problems library link').toContain('/challenges#extended-problems');
	for (const link of fragmentLinks) {
		const [path, fragment] = link.split('#');
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		await expect(
			page.locator(`[id="${fragment}"]`),
			`${link}: no element with id="${fragment}" on ${path}`,
		).toHaveCount(1);
	}
});

test('minimum-width navigation control remains visible', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 1200 });
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Open navigation' })).toBeInViewport();
});

test('Project is current without also marking Method', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1200 });
	await page.goto('/project');
	await expect(page.getByRole('heading', { level: 1, name: 'A public woodshed' })).toBeVisible();
	await expect(page.getByRole('main').getByRole('link', { name: 'Source and privacy contract' })).toHaveAttribute(
		'href',
		'/guide/source-of-truth',
	);
	const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
	await expect(navigation.getByRole('link', { name: 'Project' })).toHaveAttribute('aria-current', 'page');
	await expect(navigation.getByRole('link', { name: 'Method' })).not.toHaveAttribute('aria-current');
	await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
});

test('retired orientation URL redirects to ordinary Project', async ({ page }) => {
	await page.goto('/agent');
	await expect(page).toHaveURL(/\/project$/);
	await expect(page.getByRole('heading', { level: 1, name: 'A public woodshed' })).toBeVisible();
});

test('/guide/source-of-truth never marks Method or Project current at once', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 1200 });
	await page.goto('/guide/source-of-truth');
	const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
	await expect(navigation.getByRole('link', { name: 'Method' })).not.toHaveAttribute('aria-current');
	await expect(navigation.getByRole('link', { name: 'Project' })).not.toHaveAttribute('aria-current');
});

test('home defaults to ordinary comments and keeps Printables easy to reach', async ({ page }) => {
	await page.goto('/');
	const defaultComments = page.getByRole('region', { name: 'Start with ordinary comments' });
	await expect(defaultComments).toBeVisible();
	await expect(defaultComments).toContainText(/There are no\s+required prefixes\s+or labels/);
	await expect(defaultComments).toContainText('Personal interviewer integrations');
	await expect(defaultComments).toContainText('optional labels');
	await expect(
		page.getByRole('navigation', { name: 'Library shortcuts' }).getByRole('link', { name: 'Printables' }),
	).toBeVisible();
});

test('practice-table code tokens wrap within their cells at minimum width', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 1200 });
	await page.goto('/challenges');
	const clipped = await page.locator('table code').evaluateAll((tokens) =>
		tokens
			.filter((token) => {
				const cell = token.closest('td');
				if (!cell) return false;
				const cellRect = cell.getBoundingClientRect();
				return Array.from(token.getClientRects()).some(
					(rect) => rect.left < cellRect.left - 1 || rect.right > cellRect.right + 1,
				);
			})
			.map((token) => token.textContent),
	);
	expect(clipped).toEqual([]);
});

for (const bp of [
	{ label: 'mobile-min', width: 320, height: 1200 },
	{ label: 'desktop', width: 1440, height: 1200 },
]) {
	test(`Mermaid decision tree is discoverably keyboard-scrollable at ${bp.label}`, async ({ page }) => {
		const consoleErrors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') consoleErrors.push(message.text());
		});
		page.on('pageerror', (error) => consoleErrors.push(error.message));

		await page.setViewportSize({ width: bp.width, height: bp.height });
		await page.goto('/guide/when-to-use-what');
		await page.waitForLoadState('networkidle');

		const figure = page.locator('figure.diagram');
		const hint = page.getByText('Scroll sideways if needed to explore the full diagram.', { exact: true });
		await expect(figure).toHaveCount(1);
		await expect(figure.locator('svg')).toHaveCount(1);
		await expect(page.locator('figure.diagram-fallback')).toHaveCount(0);
		await expect(figure).toHaveAttribute('tabindex', '0');
		await expect(hint).toBeVisible();

		const hintId = await hint.getAttribute('id');
		expect(hintId).toBeTruthy();
		await expect(figure).toHaveAttribute('aria-describedby', hintId!);

		const overflow = await figure.evaluate((element) => ({
			clientWidth: element.clientWidth,
			scrollWidth: element.scrollWidth,
		}));
		expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);

		const documentWidth = await page.evaluate(() => ({
			clientWidth: document.documentElement.clientWidth,
			scrollWidth: document.documentElement.scrollWidth,
		}));
		expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth + 1);

		await figure.focus();
		await expect(figure).toBeFocused();
		const focusStyle = await figure.evaluate((element) => {
			const style = getComputedStyle(element);
			return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
		});
		expect(focusStyle.style).not.toBe('none');
		expect(focusStyle.width).toBeGreaterThanOrEqual(2);

		await figure.evaluate((element) => {
			element.scrollLeft = 0;
		});
		await page.keyboard.press('ArrowRight');
		await expect.poll(() => figure.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
		expect(consoleErrors).toEqual([]);
	});
}

test('reading-path utility links retain 44px targets', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 1200 });
	await page.goto('/guide/source-of-truth');
	const undersized = await page
		.locator('nav[aria-label="Breadcrumb"] a, [data-pagefind-ignore] a[title], footer a')
		.evaluateAll((links) =>
			links
				.filter((link) => {
					const rect = link.getBoundingClientRect();
					return rect.width > 0 && rect.height < 44;
				})
				.map((link) => ({ text: link.textContent?.trim(), height: link.getBoundingClientRect().height })),
		);
	expect(undersized).toEqual([]);
});

test('the first search query stays truthful while Pagefind resolves it', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Search the Woodshed' }).click();
	const input = page.getByRole('searchbox', { name: 'Search query' });
	await expect(page.getByText('Type at least 2 characters to search.')).toBeVisible();

	await input.fill('is prime');
	const result = page.getByRole('link', { name: /^Is Prime/ });
	await expect(page.getByText('Searching…').or(result)).toBeVisible();
	await expect(page.getByText('No results for "is prime".')).toHaveCount(0);
	await expect(result).toBeVisible();
	await expect(page.getByText('No results for "is prime".')).toHaveCount(0);
});

test('printables serves the verified booklet from the same origin with keyboard escape paths', async ({
	page,
	browserName,
}) => {
	await page.setViewportSize({ width: 1440, height: 1200 });
	await openProductPage(page, '/printables');

	const reader = page.getByTestId('printable-reader');
	const openAction = reader.getByRole('link', { name: 'Open full screen' });
	const downloadAction = reader.getByRole('link', { name: 'Download PDF' });
	const htmlAction = reader.getByRole('link', { name: 'Read HTML reference sheets' });
	await expect(reader).toBeVisible();
	await expect(htmlAction).toHaveAttribute('href', '/reference');
	await expect(reader.getByText(/The PDF does not include accessibility tags/)).toBeVisible();
	await expect(reader.getByText(/v\d+\.\d+\.\d+ · SHA-256 verified/)).toBeVisible();
	const localUrl = await openAction.getAttribute('href');
	expect(localUrl).toMatch(/^\/generated\/booklet-[0-9a-f]{64}\.pdf$/);
	await expect(downloadAction).toHaveAttribute('download', 'booklet.pdf');
	const pdfViewerEnabled = await page.evaluate(() => navigator.pdfViewerEnabled);
	if (pdfViewerEnabled) {
		await expect(reader.locator('object[type="application/pdf"]')).toBeVisible();
		await expect(reader.locator('object[type="application/pdf"]')).toHaveAttribute('data', localUrl!);
	} else {
		await expect(reader.locator('object[type="application/pdf"]')).toHaveCount(0);
		await expect(reader.getByTestId('pdf-reader-unavailable')).toBeVisible();
	}

	expect(await openAction.evaluate((element) => element.tabIndex)).toBe(0);
	if (browserName === 'webkit') {
		// macOS WebKit follows the system "keyboard navigation" preference and
		// may skip links during synthetic Tab traversal. The semantic link is
		// still focusable, so verify the same focus-visible contract directly.
		await openAction.focus();
	} else {
		let reachedOpenAction = false;
		for (let step = 0; step < 30; step += 1) {
			await page.keyboard.press('Tab');
			if (await openAction.evaluate((element) => element === document.activeElement)) {
				reachedOpenAction = true;
				break;
			}
		}
		expect(reachedOpenAction).toBe(true);
	}
	await expect(openAction).toBeFocused();
	const focusStyle = await openAction.evaluate((element) => {
		const style = getComputedStyle(element);
		return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
	});
	expect(focusStyle.style).not.toBe('none');
	expect(focusStyle.width).toBeGreaterThanOrEqual(2);
	if (browserName === 'webkit') {
		await downloadAction.focus();
	} else {
		await page.keyboard.press('Tab');
	}
	await expect(downloadAction).toBeFocused();
	if (browserName === 'webkit') {
		await htmlAction.focus();
	} else {
		await page.keyboard.press('Tab');
	}
	await expect(htmlAction).toBeFocused();

	await page.setViewportSize({ width: 768, height: 1024 });
	if (pdfViewerEnabled) {
		await expect(reader.locator('object[type="application/pdf"]')).toBeVisible();
	} else {
		await expect(reader.getByTestId('pdf-reader-unavailable')).toBeVisible();
	}

	const response = await page.request.get(localUrl!);
	expect(response.ok()).toBe(true);
	expect(response.headers()['content-type']).toContain('application/pdf');
	expect((await response.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
	await htmlAction.press('Enter');
	await expect(page).toHaveURL(/\/reference$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Reference Sheets', exact: true })).toBeVisible();
});

// Issue #30 regression guard: +layout.svelte used to mount two SearchDialog
// subtrees (one CSS-hidden at each breakpoint via `hidden lg:flex` /
// `lg:hidden`), so a raw DOM query always found two trigger buttons and two
// search inputs even though Playwright's role query only ever saw the one
// exposed by the current viewport's `display` value. Assert both the role
// query AND a raw DOM count stay at exactly one, at every breakpoint.
for (const bp of breakpoints) {
	test(`exactly one search trigger and searchbox subtree at ${bp.label} (${bp.width}px)`, async ({ page }) => {
		await page.setViewportSize({ width: bp.width, height: bp.height });
		await page.goto('/');
		await page.waitForLoadState('networkidle');

		const trigger = page.getByRole('button', { name: 'Search the Woodshed' });
		await expect(trigger).toHaveCount(1);
		expect(await page.locator('[aria-label="Search the Woodshed"]').count()).toBe(1);
		expect(await page.locator('input[type="search"]').count()).toBe(1);

		if (bp.width === 320 || bp.width === 1440) {
			const box = await trigger.boundingBox();
			expect(box?.width).toBeGreaterThanOrEqual(44);
			expect(box?.height).toBeGreaterThanOrEqual(44);
		}

		await trigger.click();
		await expect(page.getByRole('searchbox', { name: 'Search query' })).toHaveCount(1);
	});
}

test('mobile-viewport search resolves a real result end-to-end (390px)', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 1200 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Search the Woodshed' }).click();
	const input = page.getByRole('searchbox', { name: 'Search query' });
	await expect(page.getByText('Type at least 2 characters to search.')).toBeVisible();

	await input.fill('is prime');
	await expect(page.getByText('Searching…')).toBeVisible();
	await expect(page.getByText('No results for "is prime".')).toHaveCount(0);
	await expect(page.getByRole('link', { name: /^Is Prime/ })).toBeVisible();
	await expect(page.getByText('No results for "is prime".')).toHaveCount(0);
});

test('printables keeps PDF and HTML 44px actions visible when the embedded reader is hidden on mobile', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 1200 });
	await page.goto('/printables');

	const reader = page.getByTestId('printable-reader');
	await expect(reader.locator('object[type="application/pdf"]')).toBeHidden();
	const actions = [
		reader.getByRole('link', { name: 'Open full screen' }),
		reader.getByRole('link', { name: 'Download PDF' }),
		reader.getByRole('link', { name: 'Read HTML reference sheets' }),
	];
	for (const action of actions) {
		await expect(action).toBeVisible();
		const box = await action.boundingBox();
		expect(box?.height).toBeGreaterThanOrEqual(44);
	}
	await expect(reader.getByText(/Phone PDF viewers vary/)).toBeVisible();
});

test('an unavailable native PDF viewer retains a keyboard route to the HTML reference sheets', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'pdfViewerEnabled', { value: false });
	});
	// The server-rendered PDF object can start Chromium's own viewer before
	// hydration reads this false capability fixture and removes the object.
	// Admit only that viewer's canceled stylesheet; public/module errors remain fatal.
	const { expectedRequestFailures } = await openProductPage(page, '/printables', {
		expectedRequestFailure: {
			url: 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/pdf_embedder.css',
			errorText: 'net::ERR_ABORTED',
		},
	});
	for (const failure of expectedRequestFailures) {
		test.info().annotations.push({ type: 'native-viewer-fixture-cleanup', description: failure });
	}
	const reader = page.getByTestId('printable-reader');
	await expect(reader.locator('object[type="application/pdf"]')).toHaveCount(0);
	await expect(reader.getByTestId('pdf-reader-unavailable')).toBeVisible();
	const htmlAction = reader.getByRole('link', { name: 'Read HTML reference sheets' });
	await expect(htmlAction).toBeVisible();
	await htmlAction.focus();
	await htmlAction.press('Enter');
	await expect(page).toHaveURL(/\/reference$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Reference Sheets', exact: true })).toBeVisible();
});
