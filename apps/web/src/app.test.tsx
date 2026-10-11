import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import { App } from '@/app';

function renderApp(path = '/') {
  return render(<App history={createMemoryHistory({ initialEntries: [path] })} />);
}

describe('App shell', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'ok', version: '0.0.0-test' })),
    );
    await i18n.changeLanguage('en');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders header, navigation and the placeholder page', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument();
    expect(await screen.findByText(/API reachable/)).toBeInTheDocument();
  });

  it('navigates between placeholder pages', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('link', { name: 'Organizations' }));
    expect(await screen.findByRole('heading', { name: 'Organizations' })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown routes', async () => {
    renderApp('/nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('switches the language to German', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Language' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'German' }));
    expect(await screen.findByRole('heading', { name: 'Heute' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('de');
  });
});
