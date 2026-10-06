import { expect, test } from '@playwright/test';

test('session choices wait for working controls when application hydration is delayed', async ({ page, request }) => {
	const inventory = await (await request.get('/capabilities.json')).json();
	const capability = inventory.capabilities.find(
		(entry: { availability: string; modes: string[] }) =>
			entry.availability === 'available' && entry.modes.includes('study'),
	);
	let releaseScripts!: () => void;
	const scriptsReady = new Promise<void>((resolve) => {
		releaseScripts = resolve;
	});
	await page.route('**/_app/immutable/**/*.js', async (route) => {
		await scriptsReady;
		await route.continue();
	});
	await page.goto('/start', { waitUntil: 'domcontentloaded' });
	const chooser = page.getByRole('dialog', { name: 'Choose your session' });
	try {
		await expect(page.getByRole('heading', { name: 'Make time for a rep' })).toBeVisible();
		const earlyActivity = chooser.getByLabel('Choose something to work on');
		if (await earlyActivity.count()) await expect(earlyActivity).toBeDisabled();
	} finally {
		releaseScripts();
	}
	await expect(chooser).toBeVisible();
	await chooser.getByLabel('Choose something to work on').selectOption(capability.id);
	await chooser.getByRole('button', { name: '15 minutes', exact: true }).click();
	await expect(chooser.getByTestId('session-start-command')).toHaveText(
		`just session start ${capability.id} --mode study --minutes 15`,
	);
});

for (const width of [1280, 390]) {
	test(`one chooser keeps the elected session across launchers and routes at ${width}px`, async ({ page, request }) => {
		await page.setViewportSize({ width, height: 900 });
		const inventory = await (await request.get('/capabilities.json')).json();
		const capability = inventory.capabilities.find(
			(entry: { availability: string; modes: string[] }) =>
				entry.availability === 'available' && entry.modes.includes('implement'),
		);
		await page.goto('/start');
		const chooser = page.getByRole('dialog', { name: 'Choose your session' });
		await expect(chooser).toHaveCount(1);
		await chooser.getByLabel('What would you like to do?').selectOption('implement');
		await chooser.getByLabel('Choose something to work on').selectOption(capability.id);
		await chooser.getByLabel('Custom minutes').fill('45');
		await chooser.getByRole('checkbox', { name: "I'm ready to move from study to candidate work" }).check();
		const command = `just session start ${capability.id} --mode implement --minutes 45 --ready`;
		await expect(chooser.getByTestId('session-start-command')).toHaveText(command);
		await page.keyboard.press('Escape');
		const pageLauncher = page.getByRole('button', { name: 'Choose a session', exact: true });
		await pageLauncher.click();
		await expect(chooser.getByTestId('session-start-command')).toHaveText(command);
		await page.keyboard.press('Escape');
		await expect(pageLauncher).toBeFocused();
		if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
		const navLauncher = page.getByRole('button', { name: 'Start', exact: true });
		await navLauncher.click();
		await expect(chooser).toHaveCount(1);
		await expect(chooser.getByTestId('session-start-command')).toHaveText(command);
		await page.keyboard.press('Escape');
		await expect(width < 1024 ? page.getByRole('button', { name: 'Open navigation' }) : navLauncher).toBeFocused();
		if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
		const navigation =
			width < 1024
				? page.getByRole('dialog', { name: 'The DSA Woodshed navigation' })
				: page.getByRole('navigation', { name: 'Primary navigation' });
		await navigation.getByRole('link', { name: 'Library', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
		if (width < 1024) await page.getByRole('button', { name: 'Open navigation' }).click();
		await navLauncher.click();
		await expect(chooser.getByTestId('session-start-command')).toHaveText(command);
		await page.keyboard.press('Escape');
		await page.getByRole('link', { name: 'Choose a session', exact: true }).click();
		await expect(chooser.getByTestId('session-start-command')).toHaveText(command);
	});
}

test('rendered source views stay pinned while contribution editing follows main', async ({ page, request }) => {
	const receipt = await (await request.get('/deployment-receipt.json')).json();
	await page.goto('/reference/python-stdlib');
	await expect(page.getByRole('link', { name: "View this page's source on GitHub" })).toHaveAttribute(
		'href',
		`https://github.com/DSA-Woodshed/dsa-study-packet/blob/${receipt.packetCommit}/reference-sheets/01-python-stdlib.md`,
	);
	await expect(page.getByRole('link', { name: 'Edit this page on GitHub' })).toHaveAttribute(
		'href',
		'https://github.com/DSA-Woodshed/dsa-study-packet/edit/main/reference-sheets/01-python-stdlib.md',
	);
});

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
	await expect(chooser.getByTestId('session-start-command')).toHaveText(
		`just session start ${capability.id} --mode study --minutes 15`,
	);
	await expect(chooser.getByRole('link', { name: 'Open in Codespaces' })).toHaveAttribute(
		'href',
		'https://codespaces.new/DSA-Woodshed/dsa-study-packet?quickstart=1',
	);
	await chooser.getByLabel('What would you like to do?').selectOption('read');
	await expect(chooser.getByTestId('session-start-command')).toHaveCount(0);
	const reference = inventory.capabilities.find(
		(entry: { availability: string; modes: string[] }) =>
			entry.availability === 'available' && entry.modes.includes('read'),
	);
	await chooser.getByLabel('Choose something to work on').selectOption(reference.id);
	await chooser.getByLabel('Custom minutes').fill('45');
	await expect(chooser.getByTestId('session-start-command')).toHaveText(
		`just session start ${reference.id} --mode read --minutes 45`,
	);
	await chooser.getByLabel('Custom minutes').fill('1440');
	await expect(chooser.getByTestId('session-start-command')).toHaveText(
		`just session start ${reference.id} --mode read --minutes 1440`,
	);
	await chooser.getByLabel('Custom minutes').fill('1441');
	await expect(chooser.getByRole('alert')).toHaveText('Choose a budget from 1 to 1440 minutes.');
	await chooser.getByLabel('Custom minutes').fill('0');
	await expect(chooser.getByRole('alert')).toHaveText('Choose a budget from 1 to 1440 minutes.');
	await expect(chooser.getByRole('link', { name: 'Open in Codespaces' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(chooser).toBeHidden();
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(chooser).toBeVisible();
});

test('candidate readiness is explicit and reset when the chosen activity changes', async ({ page, request }) => {
	const inventory = await (await request.get('/capabilities.json')).json();
	const algorithms = inventory.capabilities.filter(
		(entry: { kind: string; availability: string }) => entry.kind === 'algorithm' && entry.availability === 'available',
	);
	await page.goto('/start');
	const chooser = page.getByRole('dialog', { name: 'Choose your session' });
	const mode = chooser.getByLabel('What would you like to do?');
	const activity = chooser.getByLabel('Choose something to work on');
	const command = chooser.getByTestId('session-start-command');
	await mode.selectOption('implement');
	await activity.selectOption(algorithms[0].id);
	const readiness = chooser.getByRole('checkbox', { name: "I'm ready to move from study to candidate work" });
	await expect(readiness).not.toBeChecked();
	await expect(command).toHaveText(`just session start ${algorithms[0].id} --mode implement --minutes 30`);
	await readiness.check();
	await expect(command).toHaveText(`just session start ${algorithms[0].id} --mode implement --minutes 30 --ready`);
	await activity.selectOption(algorithms[1].id);
	await expect(readiness).not.toBeChecked();
	await expect(command).toHaveText(`just session start ${algorithms[1].id} --mode implement --minutes 30`);
	await readiness.check();
	await mode.selectOption('tests-first');
	await expect(command).toHaveCount(0);
	await activity.selectOption(algorithms[0].id);
	await expect(readiness).not.toBeChecked();
	await readiness.check();
	await expect(command).toHaveText(`just session start ${algorithms[0].id} --mode tests-first --minutes 30 --ready`);
});

test('every offered mode uses the published options and protected services stay an explicit runtime check', async ({
	page,
	request,
}) => {
	const inventory = await (await request.get('/capabilities.json')).json();
	const available = inventory.capabilities.filter(
		(entry: { availability: string }) => entry.availability === 'available',
	);
	const modes = [...new Set<string>(available.flatMap((entry: { modes: string[] }) => entry.modes))].sort();
	await page.goto('/start');
	const chooser = page.getByRole('dialog', { name: 'Choose your session' });
	const intent = chooser.getByLabel('What would you like to do?');
	expect(
		await intent
			.locator('option')
			.evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).sort()),
	).toEqual(modes);
	for (const mode of modes) {
		await intent.selectOption(mode);
		const expected = available
			.filter((entry: { modes: string[] }) => entry.modes.includes(mode))
			.map((entry: { id: string }) => entry.id)
			.sort();
		expect(
			await chooser
				.getByLabel('Choose something to work on')
				.locator('option')
				.evaluateAll((options) =>
					options
						.map((option) => (option as HTMLOptionElement).value)
						.filter(Boolean)
						.sort(),
				),
		).toEqual(expected);
	}
	await chooser.getByText('Continue or close an existing session', { exact: true }).click();
	await expect(chooser.locator('code').filter({ hasText: /^just session current$/ })).toBeVisible();
	await expect(chooser.locator('code').filter({ hasText: /^just session resume$/ })).toBeVisible();
	await expect(chooser.locator('code').filter({ hasText: /^just session finish "one correction"$/ })).toBeVisible();
	await chooser.getByText('Optional protected services', { exact: true }).click();
	await expect(chooser.locator('code').filter({ hasText: /^just protected-capability$/ })).toBeVisible();
	await expect(chooser.locator('details').filter({ hasText: 'Optional protected services' })).toContainText(
		'It reports unavailable (exit 78)',
	);
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
