import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse, SearchResult, TodayResponse } from '@app/shared';
import i18n from '@/i18n';
import { App } from '@/app';
import { SearchHit } from '@/components/search/search-hit';
import { toDateOnly } from '@/lib/dates';
import { setPaletteOpen } from '@/lib/palette';
import { mockApi, SIGNED_IN } from '@/test/fetch-mock';

const ref = { id: 'p1', displayName: 'Jana Müller', initials: 'JM', spaceId: 's1', photoUrl: null };
const hit: SearchResult = {
  type: 'person',
  id: 'p1',
  spaceId: 's1',
  person: ref,
  subtitle: 'Einkauf @ Standort Köln',
  archived: false,
  relatedTo: null,
  matches: [
    { field: 'name', label: null, entry: null, text: 'Jana Müller', highlights: [[5, 11]] },
    {
      field: 'entry',
      label: null,
      entry: { id: 'e1', kind: 'call', occurredAt: '2026-10-02T09:30:00.000Z' },
      text: '…wartet auf das Angebot für Köln.',
      highlights: [[16, 23]],
    },
  ],
};

beforeAll(() => {
  // cmdk scrolls the selected item into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => i18n.changeLanguage('en'));
afterEach(() => {
  vi.unstubAllGlobals();
  setPaletteOpen(false);
});

describe('SearchHit', () => {
  it('highlights the query in the name and shows where else it matched', () => {
    const { container } = render(<SearchHit result={hit} query="mueller angebot" color={null} />);
    const marks = [...container.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['Müller', 'Angebot']);
    expect(screen.getByText(/Call · Oct 2, 2026:/)).toBeInTheDocument();
    expect(screen.getByText(/Einkauf @ Standort Köln/)).toBeInTheDocument();
  });
});

describe('indirect contacts', () => {
  it('shows through whom an indirect contact is known', () => {
    const lea: SearchResult = {
      ...hit,
      person: { ...ref, id: 'p2', displayName: 'Lea Berger' },
      id: 'p2',
      subtitle: null,
      relatedTo: {
        label: { name: null, nameKey: 'seed.relationshipTypes.child' },
        person: { ...ref, displayName: 'Jana Berger' },
      },
      matches: [],
    };
    render(<SearchHit result={lea} query="lea" color={null} />);
    expect(screen.getByText(/Child of Jana Berger/)).toBeInTheDocument();
  });
});

describe('command palette', () => {
  it('opens with Ctrl+K, searches on the server and opens a person', async () => {
    const response: SearchResponse = { results: [hit], hasMore: false, tookMs: 3 };
    mockApi(SIGNED_IN, {
      'GET /api/v1/search?q=mueller&limit=8': () => Response.json(response),
    });
    render(<App history={createMemoryHistory({ initialEntries: ['/people'] })} />);
    await screen.findByRole('heading', { level: 1, name: 'People' });

    await userEvent.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    await userEvent.keyboard('mueller');
    const option = await within(dialog).findByRole('option', { name: /Einkauf @ Standort Köln/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(
      within(dialog).getByRole('option', { name: 'Log a call with Jana Müller' }),
    ).toBeVisible();
    expect(within(dialog).getByRole('option', { name: 'New person “mueller”' })).toBeVisible();

    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });
});

describe('Today page', () => {
  it('shows due follow-ups, birthdays, overdue contacts and recently viewed people', async () => {
    const today: TodayResponse = {
      date: toDateOnly(new Date()),
      reminders: [
        {
          id: 'r1',
          title: 'Send the offer',
          dueOn: '2026-10-01',
          doneAt: null,
          entryId: null,
          person: ref,
        },
      ],
      birthdays: [
        {
          person: ref,
          birthday: '1985-10-12',
          on: '2026-10-12',
          inDays: 0,
          turns: 41,
          relatedTo: null,
        },
      ],
      dates: [
        {
          person: ref,
          dateId: 'd1',
          kind: 'wedding',
          label: null,
          date: '2016-10-14',
          on: '2026-10-14',
          inDays: 2,
          years: 10,
          relatedTo: null,
        },
      ],
      overdueContacts: [
        {
          person: ref,
          contactEveryDays: 30,
          lastContactAt: '2026-08-01T10:00:00.000Z',
          overdueDays: 42,
        },
      ],
      backup: null,
      recent: [
        {
          person: ref,
          subtitle: 'Einkauf @ Standort Köln',
          relatedTo: null,
          viewedAt: '2026-10-12T08:00:00.000Z',
        },
      ],
    };
    mockApi(SIGNED_IN, {
      [`GET /api/v1/today?date=${today.date}`]: () => Response.json(today),
    });
    render(<App history={createMemoryHistory({ initialEntries: ['/'] })} />);
    const due = await screen.findByRole('region', { name: 'Due' });
    expect(within(due).getByText('Send the offer')).toBeInTheDocument();
    expect(
      within(due).getByRole('checkbox', { name: 'Mark “Send the offer” as done' }),
    ).toBeVisible();
    const birthdays = screen.getByRole('region', { name: 'Birthdays and other days · 14 days' });
    expect(within(birthdays).getByText(/today · turns 41/)).toBeInTheDocument();
    const [first, second] = within(birthdays).getAllByTestId('today-day');
    expect(first).toHaveTextContent('Birthday');
    expect(second).toHaveTextContent('Wedding anniversary');
    expect(second).toHaveTextContent('in 2 days · 10 years');
    const overdue = screen.getByRole('region', { name: 'Long time no talk' });
    expect(within(overdue).getByText('overdue by 42 days')).toBeInTheDocument();
    const recent = screen.getByRole('region', { name: 'Recently viewed' });
    expect(within(recent).getByRole('link', { name: /Jana Müller/ })).toHaveAttribute(
      'href',
      '/people/p1',
    );
  });
});
