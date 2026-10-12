import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { App } from '@/app';
import { FRESH, mockApi, SIGNED_IN, SIGNED_OUT } from '@/test/fetch-mock';

function renderApp(path = '/') {
  return render(<App history={createMemoryHistory({ initialEntries: [path] })} />);
}

// Sidebar (desktop) and tab bar (mobile) are both in the DOM; CSS decides which is visible.
const firstLink = (name: string) => screen.getAllByRole('link', { name })[0]!;

describe('App shell', () => {
  beforeEach(async () => {
    mockApi(SIGNED_IN);
    await i18n.changeLanguage('en');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders navigation and the Today page', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(2);
    expect(firstLink('People')).toBeInTheDocument();
    expect(firstLink('Settings')).toBeInTheDocument();
    expect(firstLink('Erika Musterfrau')).toHaveAttribute('href', '/settings');
  });

  it('marks the active navigation item', async () => {
    renderApp('/people');
    await screen.findByRole('heading', { level: 1, name: 'People' });
    for (const link of screen.getAllByRole('link', { name: 'People' })) {
      expect(link).toHaveAttribute('aria-current', 'page');
    }
    expect(firstLink('Today')).not.toHaveAttribute('aria-current');
  });

  it('navigates between pages', async () => {
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

  it('shows account, passkeys and API status in settings', async () => {
    renderApp('/settings');
    expect(await screen.findByText('erika@example.com')).toBeInTheDocument();
    expect(await screen.findByText(/Passkeys are switched off/)).toBeInTheDocument();
    expect(await screen.findByText(/API reachable/)).toBeInTheDocument();
  });

  it('switches passkeys on in settings', async () => {
    mockApi(SIGNED_IN, {
      'PATCH /api/v1/settings': () => Response.json({ passkeysEnabled: true }),
    });
    renderApp('/settings');
    await userEvent.click(await screen.findByRole('radio', { name: 'On' }));
    expect(await screen.findByText('No passkeys yet.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'On' })).toHaveAttribute('aria-checked', 'true');
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

describe('auth guards', () => {
  beforeEach(() => i18n.changeLanguage('en'));
  afterEach(() => vi.unstubAllGlobals());

  it('sends a fresh instance to the setup', async () => {
    mockApi(FRESH);
    renderApp('/people');
    expect(await screen.findByRole('heading', { level: 1, name: 'Set up' })).toBeInTheDocument();
  });

  it('sends signed-out visitors to the login and back after signing in', async () => {
    mockApi(SIGNED_OUT, {
      'POST /api/v1/auth/login': () => Response.json({ account: SIGNED_IN.account }),
    });
    renderApp('/organizations');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email'), 'erika@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Organizations' }),
    ).toBeInTheDocument();
  });

  it('shows a readable error for wrong credentials', async () => {
    mockApi(SIGNED_OUT, {
      'POST /api/v1/auth/login': () =>
        Response.json({ error: 'invalid_credentials' }, { status: 401 }),
    });
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'erika@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong.');
  });

  it('validates the setup form before sending it', async () => {
    const fetchMock = mockApi(FRESH);
    renderApp('/setup');
    await userEvent.type(await screen.findByLabelText('Your name'), 'Erika');
    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('At least 12 characters.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/auth/setup', expect.anything());
  });

  it('keeps the post-login redirect on this site', async () => {
    const { safeRedirect } = await import('@/lib/redirect');
    expect(safeRedirect('/people?x=1')).toBe('/people?x=1');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('https://evil.example')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });
});
