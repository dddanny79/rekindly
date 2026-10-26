import { devices, expect, type Page, test } from '@playwright/test';

const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

async function createOrganization(page: Page, name: string) {
  await page.goto('/organizations');
  await page.getByRole('button', { name: 'New organization' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
}

async function addAddress(page: Page) {
  const addresses = section(page, 'Addresses');
  await addresses.getByRole('button', { name: 'Add address' }).click();
  await addresses.getByLabel('Street').fill('Hafenweg 3');
  await addresses.getByLabel('Postcode').fill('20457');
  await addresses.getByLabel('City').fill('Hamburg');
  await addresses.getByRole('button', { name: 'Save' }).click();
  await expect(addresses).toContainText('20457 Hamburg');
  return addresses;
}

const QUERY = encodeURIComponent('Hafenweg 3, 20457 Hamburg');

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('organization website is a link with its own edit button; addresses open OpenStreetMap', async ({
    page,
  }) => {
    await createOrganization(page, 'Nordlicht GmbH');
    const details = section(page, 'Details');
    await details.getByRole('button', { name: /Website/ }).click();
    await details.getByRole('textbox', { name: 'Website' }).fill('nordlicht.example');
    await details.getByRole('textbox', { name: 'Website' }).press('Enter');

    const link = details.getByRole('link', { name: 'nordlicht.example' });
    await expect(link).toHaveAttribute('href', 'https://nordlicht.example');
    await expect(link).toHaveAttribute('target', '_blank');
    await details.getByRole('button', { name: 'Edit Website' }).click();
    await expect(details.getByRole('textbox', { name: 'Website' })).toHaveValue(
      'nordlicht.example',
    );
    await details.getByRole('textbox', { name: 'Website' }).press('Escape');

    const addresses = await addAddress(page);
    await expect(addresses.getByRole('link', { name: /on a map/ })).toHaveAttribute(
      'href',
      `https://www.openstreetmap.org/search?query=${QUERY}`,
    );
    await expect(addresses.getByRole('link', { name: /Directions to/ })).toHaveAttribute(
      'href',
      `https://www.openstreetmap.org/directions?to=${QUERY}`,
    );
  });
});

test.describe('iPhone', () => {
  // The iPhone's size, touch and user agent; the browser stays Chromium.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['iPhone 13'];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test('fields are 16px so Safari does not zoom; addresses open Apple Maps', async ({ page }) => {
    await createOrganization(page, 'Möwe & Co');
    const addresses = section(page, 'Addresses');
    await addresses.getByRole('button', { name: 'Add address' }).click();
    for (const field of ['Street', 'Postcode']) {
      await expect(addresses.getByLabel(field)).toHaveCSS('font-size', '16px');
    }
    await addresses.getByRole('button', { name: 'Cancel' }).click();

    await addAddress(page);
    await expect(addresses.getByRole('link', { name: /on a map/ })).toHaveAttribute(
      'href',
      `https://maps.apple.com/?q=${QUERY}`,
    );
    await expect(addresses.getByRole('link', { name: /Directions to/ })).toHaveAttribute(
      'href',
      `https://maps.apple.com/?daddr=${QUERY}`,
    );
  });
});
