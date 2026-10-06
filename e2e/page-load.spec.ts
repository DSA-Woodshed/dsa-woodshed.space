import { expect, test } from '@playwright/test';
import { openProductPage } from './page-load';

test('page-loaded guard rejects an HTTP 200 client error page that fits the viewport', async ({ page }) => {
	await page.route('**/reference', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/html',
			body: '<!doctype html><main><p>500</p><h1>Internal Error</h1></main>',
		}),
	);
	const response = await page.goto('/reference');
	expect(response?.ok()).toBe(true);
	const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
	expect(fitsViewport).toBe(true);
	await expect(openProductPage(page, '/reference')).rejects.toThrow();
});

test('page-loaded guard rejects a failed navigation', async ({ page }) => {
	await page.route('**/reference', (route) => route.abort('failed'));
	await expect(openProductPage(page, '/reference')).rejects.toThrow();
});

test('page-loaded guard accepts the authored reference heading instead of its navigation title', async ({ page }) => {
	await page.route('**/reference/algorithm-templates', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/html',
			body: '<!doctype html><main><h1>Algorithm Templates (Page 1 of 4)</h1></main>',
		}),
	);
	await openProductPage(page, '/reference/algorithm-templates');
});
