import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Person } from '@app/shared';
import i18n from '@/i18n';
import { BriefingCard } from '@/components/person/briefing';
import { addDays, toDateOnly } from '@/lib/dates';

const base: Person = {
  id: 'p1',
  spaceId: 's1',
  displayName: 'Jana Berger',
  initials: 'JB',
  prefix: null,
  firstName: 'Jana',
  middleName: null,
  lastName: 'Berger',
  suffix: null,
  nickname: null,
  maidenName: null,
  pronouns: null,
  birthday: null,
  summary: null,
  metWhere: null,
  metWhen: null,
  metThrough: null,
  photoUrl: null,
  favorite: false,
  listed: true,
  contactRhythmSince: null,
  relatedTo: null,
  contactEveryDays: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  contactPoints: [],
  addresses: [],
  affiliations: [],
  relationships: [],
  tags: [],
  fields: [],
  facts: [],
  reminders: [],
  lastContact: null,
};

const renderCard = (person: Person) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BriefingCard person={person} />
    </QueryClientProvider>,
  );

describe('BriefingCard', () => {
  beforeEach(() => i18n.changeLanguage('en'));

  it('shows a hint when there is nothing yet', () => {
    renderCard(base);
    expect(screen.getByText(/Nothing for the briefing yet/)).toBeInTheDocument();
  });

  it('handles birthdays with and without year', () => {
    const soon = addDays(new Date(), 3);
    const md = toDateOnly(soon).slice(5);
    const { unmount } = renderCard({ ...base, birthday: `--${md}` });
    expect(screen.getByTestId('briefing-birthday')).toHaveTextContent('in 3 days');
    expect(screen.getByTestId('briefing-birthday')).not.toHaveTextContent('turns');
    unmount();
    renderCard({ ...base, birthday: `1980-${md}` });
    expect(screen.getByTestId('briefing-birthday')).toHaveTextContent(
      `turns ${soon.getFullYear() - 1980}`,
    );
  });

  it('shows pinned facts only, open follow-ups and an overdue rhythm', () => {
    renderCard({
      ...base,
      contactEveryDays: 30,
      facts: [
        { id: 'f1', text: 'Drinks no coffee', pinned: true, sort: 0 },
        { id: 'f2', text: 'Not pinned', pinned: false, sort: 1 },
      ],
      reminders: [
        {
          id: 'r1',
          title: 'Send offer',
          dueOn: toDateOnly(addDays(new Date(), -2)),
          doneAt: null,
          entryId: null,
          person: null,
        },
      ],
      lastContact: {
        entryId: 'e1',
        occurredAt: addDays(new Date(), -40).toISOString(),
        kind: 'call',
        direction: 'out',
        excerpt: 'Budget approved',
      },
    });
    expect(screen.getByText('Drinks no coffee')).toBeInTheDocument();
    expect(screen.queryByText('Not pinned')).not.toBeInTheDocument();
    expect(screen.getByText('overdue for 2 days')).toBeInTheDocument();
    expect(screen.getByTestId('briefing-last-contact')).toHaveTextContent(
      '↗ Call · Budget approved',
    );
    expect(screen.getByTestId('briefing-rhythm')).toHaveTextContent('overdue by 10 days');
  });
});
