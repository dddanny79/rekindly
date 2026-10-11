import { expect, type Locator, type Page, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

/** Fills first and last name separately (“Jana Berger” → Jana / Berger). */
async function fillName(dialog: Locator, name: string) {
  const [first, ...rest] = name.split(' ');
  await dialog.getByLabel('First name').fill(first!);
  await dialog.getByLabel('Last name').fill(rest.join(' '));
}

async function createPerson(page: Page, name: string) {
  await page.goto('/people');
  await page.getByRole('button', { name: 'New person' }).click();
  const dialog = page.getByRole('dialog', { name: 'New person' });
  await fillName(dialog, name);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return page.url();
}

const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

test('a person with two phones, email, address, tag and custom field — all inline', async ({
  page,
}) => {
  // A custom field to fill in later.
  await page.goto('/settings/fields');
  await page.getByLabel('Label').fill('Favourite drink');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('button', { name: /^Label: Favourite drink/ })).toBeVisible();

  const url = await createPerson(page, 'Jana Berger');
  const contact = section(page, 'Contact');

  for (const [label, value] of [
    ['Mobile', '+49 171 555 88 31'],
    ['Work', '+49 221 555 01 42'],
  ] as const) {
    await contact.getByRole('button', { name: 'Add contact' }).click();
    await contact.getByLabel('Label').fill(label);
    await contact.getByLabel('Value').fill(value);
    await contact.getByRole('button', { name: 'Save' }).click();
    await expect(contact.getByRole('link', { name: value })).toHaveAttribute(
      'href',
      `tel:${value.replace(/\s/g, '')}`,
    );
  }
  await contact.getByRole('button', { name: 'Add contact' }).click();
  await contact.getByLabel('Kind').selectOption('email');
  await contact.getByLabel('Value').fill('j.berger@example.com');
  await contact.getByRole('button', { name: 'Save' }).click();
  await expect(contact.getByRole('link', { name: 'j.berger@example.com' })).toHaveAttribute(
    'href',
    'mailto:j.berger@example.com',
  );

  const addresses = section(page, 'Addresses');
  await addresses.getByRole('button', { name: 'Add address' }).click();
  await addresses.getByLabel('Street').fill('Musterstraße 12');
  await addresses.getByLabel('Postcode').fill('50667');
  await addresses.getByLabel('City').fill('Köln');
  await addresses.getByRole('button', { name: 'Save' }).click();
  await expect(addresses).toContainText('50667 Köln');

  const tags = section(page, 'Tags');
  await tags.getByRole('combobox', { name: 'Add tag' }).fill('customer');
  await tags.getByRole('option', { name: 'Create tag “#customer”' }).click();
  await expect(tags.getByRole('listitem')).toHaveText(['#customer']);

  const fields = section(page, 'Custom fields');
  await fields.getByRole('button', { name: /^Favourite drink/ }).click();
  await fields.getByLabel('Favourite drink').fill('Green tea');
  await fields.getByLabel('Favourite drink').press('Enter');
  await expect(fields).toContainText('Green tea');

  // Everything is stored: reload and check.
  await page.goto(url);
  await expect(section(page, 'Contact').getByRole('link')).toHaveCount(3);
  await expect(section(page, 'Addresses')).toContainText('Musterstraße 12');
  await expect(page.locator('header').first()).toContainText('#customer');
  await expect(section(page, 'Custom fields')).toContainText('Green tea');

  // Inline edit in the header.
  await page.getByRole('button', { name: /^Who is this\?/ }).click();
  await page.getByLabel('Who is this?').fill('Head of purchasing');
  await page.getByLabel('Who is this?').press('Enter');
  await expect(
    page.getByRole('button', { name: /^Who is this\?: Head of purchasing/ }),
  ).toBeVisible();
});

test('organization hierarchy and the path in the person header', async ({ page }) => {
  await page.goto('/organizations');
  await page.getByRole('button', { name: 'New organization' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Beispiel AG');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Beispiel AG');

  for (const name of ['Beispiel GmbH', 'Standort Köln']) {
    await section(page, 'Sub-organizations')
      .getByRole('button', { name: 'Add sub-organization' })
      .click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  }
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
    'Beispiel AG / Beispiel GmbH',
  );

  // Cycles are not offered as parents: Beispiel AG cannot move below its own child.
  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Beispiel AG' })
    .click();
  await page.getByRole('combobox', { name: 'Parent organization' }).fill('Standort');
  await expect(page.getByRole('option', { name: 'Standort Köln' })).toHaveCount(0);

  await createPerson(page, 'Petra Pfad');
  const orgs = section(page, 'Organizations');
  await orgs.getByRole('button', { name: 'Add organization' }).click();
  await orgs.getByRole('combobox', { name: 'Organization' }).fill('Standort');
  await orgs.getByRole('option', { name: 'Standort Köln' }).click();
  await orgs.getByRole('textbox', { name: 'Role' }).fill('Leitung Einkauf');
  await orgs.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('header').first()).toContainText(
    'Leitung Einkauf @ Beispiel AG › Beispiel GmbH › Standort Köln',
  );
  await page.getByRole('link', { name: 'Standort Köln' }).first().click();
  await expect(section(page, 'People')).toContainText('Petra Pfad');
});

test('a relationship shows up at the other person with the reverse name', async ({ page }) => {
  const bUrl = await createPerson(page, 'Bernd Beziehung');
  await createPerson(page, 'Anna Beziehung');

  const rel = section(page, 'Relationships');
  await rel.getByRole('button', { name: 'Add relationship' }).click();
  await rel.getByRole('combobox', { name: 'Person' }).fill('Bernd');
  await rel.getByRole('option', { name: /Bernd Beziehung/ }).click();
  await rel.getByLabel('Bernd Beziehung is … of Anna Beziehung').selectOption({ label: 'Parent' });
  await rel.getByRole('button', { name: 'Save' }).click();
  await expect(rel).toContainText('Bernd Beziehung');
  await expect(rel).toContainText('Parent');

  await page.goto(bUrl);
  const reverse = section(page, 'Relationships');
  await expect(reverse).toContainText('Anna Beziehung');
  await expect(reverse).toContainText('Child');
});

test('the space switcher filters the lists and is remembered', async ({ page }) => {
  for (const [name, space] of [
    ['Paula Privat', 'Private'],
    ['Bruno Business', 'Business'],
  ] as const) {
    await page.goto('/people');
    await page.getByRole('button', { name: 'New person' }).click();
    const dialog = page.getByRole('dialog');
    await fillName(dialog, name);
    await dialog.getByLabel('Space').selectOption({ label: space });
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }

  const spaces = page.getByRole('radiogroup', { name: 'Space' });
  await page.goto('/people');
  // Keyboard: N opens the quick entry.
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: 'New person' })).toBeVisible();
  await page.keyboard.press('Escape');
  const table = page.locator('table');
  await spaces.getByRole('radio', { name: 'Business' }).click();
  await expect(table).toContainText('Bruno Business');
  await expect(table).not.toContainText('Paula Privat');

  await spaces.getByRole('radio', { name: 'Private' }).click();
  await expect(table).toContainText('Paula Privat');
  await expect(table).not.toContainText('Bruno Business');

  await page.reload();
  await expect(
    page.getByRole('radiogroup', { name: 'Space' }).getByRole('radio', { name: 'Private' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radiogroup', { name: 'Space' }).getByRole('radio', { name: 'All' }).click();
  await expect(table).toContainText('Paula Privat');
  await expect(table).toContainText('Bruno Business');
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the person page has no horizontal scrolling at 375 px', async ({ page }) => {
    await page.goto('/people');
    await page
      .locator('ul')
      .getByRole('link', { name: /Jana Berger/ })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Jana Berger' })).toBeVisible();
    const [scrollWidth, width] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      window.innerWidth,
    ]);
    expect(scrollWidth).toBeLessThanOrEqual(width);
    // Bottom sheet space switcher.
    await page.getByRole('button', { name: /^Space:/ }).click();
    await expect(page.getByRole('dialog', { name: 'Space' })).toBeVisible();
  });
});
