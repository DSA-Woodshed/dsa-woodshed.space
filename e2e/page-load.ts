import { readFileSync } from 'node:fs';
import { expect, type ConsoleMessage, type Page, type Request } from '@playwright/test';

const manifest = JSON.parse(readFileSync('src/content/.manifest.json', 'utf8')) as {
	entries: { section: string; slug: string; title: string }[];
};
const headings = new Map([
	['/', 'Woodshedding for the whiteboard.'],
	['/library', 'Library'],
	['/reference', 'Reference Sheets'],
	['/project', 'A public woodshed'],
	['/agent', 'A public woodshed'],
	['/start', 'Make time for a rep'],
	...manifest.entries.map(({ section, slug, title }): [string, string] => [
		section === 'challenges' || section === 'printables' ? `/${section}` : `/${section}/${slug}`,
		title,
	]),
]);

export async function openProductPage(page: Page, route: string) {
	const heading = headings.get(route);
	if (!heading) throw new Error(`No rendered-page expectation for ${route}`);
	const errors: string[] = [];
	const onPageError = (error: Error) => errors.push(error.message);
	const onRequestFailed = (request: Request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`);
	const onConsole = (message: ConsoleMessage) => {
		if (message.type() === 'error') errors.push(message.text());
	};
	page.on('pageerror', onPageError);
	page.on('requestfailed', onRequestFailed);
	page.on('console', onConsole);
	try {
		const response = await page.goto(route);
		expect(response?.ok(), `${route} must serve a real product page`).toBe(true);
		await page.waitForLoadState('networkidle');
		await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
		expect(errors, `${route} must load without browser errors`).toEqual([]);
	} finally {
		page.off('pageerror', onPageError);
		page.off('requestfailed', onRequestFailed);
		page.off('console', onConsole);
	}
}
