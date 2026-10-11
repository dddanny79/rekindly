import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { App } from '@/app';

function renderApp(path = '/') {
  return render(<App history={createMemoryHistory({ initialEntries: [path] })} />);
}

// Sidebar (desktop) and tab bar (mobile) are both in the DOM; CSS decides which is visible.
const firstLink = (name: string) => screen.getAllByRole('link', { name })[0]!;

describe('App shell', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'ok', version: '0.0.0-test' })),
    );
    await i18n.changeLanguage('en');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders navigation and the placeholder page', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(2);
    expect(firstLink('People')).toBeInTheDocument();
    expect(firstLink('Settings')).toBeInTheDocument();
    expect((await screen.findAllByText(/API reachable/)).length).toBeGreaterThan(0);
  });

  it('marks the active navigation item', async () => {
    renderApp('/people');
    await screen.findByRole('heading', { level: 1, name: 'People' });
    for (const link of screen.getAllByRole('link', { name: 'People' })) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
    expect(firstLink('Today')).not.toHaveAttribute('aria-current');
  });

  it('navigates between placeholder pages', async () => {
    renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await userEvent.click(firstLink('Organizations'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Organizations' }),
    ).toBeInTheDocument();
  });

  it('shows a not-found page for unknown routes', async () => {
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('toggles the language to German from the sidebar', async () => {
    renderApp();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Language: English, switch to German' }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Heute' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('de');
  });

  it('switches the language on the More page', async () => {
    renderApp('/more');
    await userEvent.click(await screen.findByRole('radio', { name: 'German' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Mehr' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Deutsch' })).toHaveAttribute('aria-checked', 'true');
  });

  it('switches the appearance on the settings page', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    renderApp('/settings');
    const group = await screen.findByRole('radiogroup', { name: 'Appearance' });
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');

    // Arrow keys move the selection within the group.
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(group).toContainElement(document.activeElement as HTMLElement);
  });
});
