import { expect, test } from '@playwright/test';

test('guided session uses the published inventory and chosen budget', async ({ page, request }) => {
	const response = await request.get('/capabilities.json');
	expect(response.ok()).toBe(true);
	const inventory = await response.json();
	const capability = inventory.capabilities.find(
		(entry: { availability: string; modes: string[] }) =>
			entry.availability === 'available' && entry.modes.includes('study'),
	);
	await page.goto('/start');
	const chooser = page.getByRole('dialog', { name: 'Choose your session' });
	await expect(chooser).toBeVisible();
	await chooser.getByLabel('Choose something to work on').selectOption(capability.id);
	await chooser.getByRole('button', { name: '15 minutes', exact: true }).click();
	await expect(chooser.locator('code')).toHaveText(`just session start ${capability.id} --mode study --minutes 15`);
	await expect(chooser.getByRole('link', { name: 'Open in Codespaces' })).toHaveAttribute(
		'href',
		'https://codespaces.new/DSA-Woodshed/dsa-study-packet?quickstart=1',
	);
	await chooser.getByLabel('What would you like to do?').selectOption('read');
	await expect(chooser.locator('code')).toHaveCount(0);
	const reference = inventory.capabilities.find(
		(entry: { availability: string; modes: string[] }) =>
			entry.availability === 'available' && entry.modes.includes('read'),
	);
	await chooser.getByLabel('Choose something to work on').selectOption(reference.id);
	await chooser.getByLabel('Custom minutes').fill('45');
	await expect(chooser.locator('code')).toHaveText(`just session start ${reference.id} --mode read --minutes 45`);
	await chooser.getByLabel('Custom minutes').fill('0');
	await expect(chooser.getByRole('alert')).toHaveText('Choose a budget from 1 to 480 minutes.');
	await expect(chooser.getByRole('link', { name: 'Open in Codespaces' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(chooser).toBeHidden();
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(chooser).toBeVisible();
});

test('shared theme choice survives a reload', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'xoxd');
	await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
	const themeButton = page.getByRole('button', { name: /theme/i }).first();
	await themeButton.click();
	await page.getByRole('button', { name: 'Set color mode to Light', exact: true }).click();
	await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
});
