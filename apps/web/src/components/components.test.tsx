import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { Combobox } from '@/components/combobox';
import { InlineText } from '@/components/inline-edit';
import { contactHref, formatAddress } from '@/lib/format';

describe('Combobox', () => {
  const options = [
    { value: '1', label: 'Jürgen Müller' },
    { value: '2', label: 'Clara Weidemann' },
  ];

  it('filters umlaut-insensitively and selects with the keyboard', async () => {
    const onSelect = vi.fn();
    render(<Combobox label="Person" options={options} onSelect={onSelect} />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Person' }), 'mueller');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Jürgen Müller']);
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(options[0]);
  });

  it('offers to create an entry without an exact match', async () => {
    const onCreate = vi.fn();
    render(
      <Combobox
        label="Organization"
        options={options}
        onSelect={vi.fn()}
        onCreate={onCreate}
        createLabel={(q) => `Create “${q}”`}
      />,
    );
    await userEvent.type(screen.getByRole('combobox'), 'Beispiel AG');
    await userEvent.click(screen.getByRole('option', { name: 'Create “Beispiel AG”' }));
    expect(onCreate).toHaveBeenCalledWith('Beispiel AG');
  });
});

describe('InlineText', () => {
  it('saves on Enter and cancels on Escape', async () => {
    const onSave = vi.fn(async () => {});
    render(<InlineText label="Nickname" value="Jani" onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: /Nickname: Jani/ }));
    const input = screen.getByRole('textbox', { name: 'Nickname' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Bergi{Escape}');
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Nickname: Jani/ }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Nickname' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nickname' }), 'Bergi{Enter}');
    expect(onSave).toHaveBeenCalledWith('Bergi');
  });

  it('shows validation errors and keeps editing', async () => {
    const onSave = vi.fn(async () => {});
    render(
      <InlineText label="Birthday" value={null} validate={() => 'Invalid date'} onSave={onSave} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Birthday/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Birthday' }), 'tomorrow{Enter}');
    expect(screen.getByText('Invalid date')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a web address as a link with its own edit button', async () => {
    const onSave = vi.fn(async () => {});
    render(
      <InlineText
        label="Website"
        value="https://example.com/"
        display="example.com"
        href="https://example.com/"
        onSave={onSave}
      />,
    );
    const link = screen.getByRole('link', { name: 'example.com' });
    expect(link).toHaveAttribute('href', 'https://example.com/');
    expect(link).toHaveAttribute('target', '_blank');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Website' }));
    await userEvent.clear(screen.getByRole('textbox', { name: 'Website' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Website' }), 'example.org{Enter}');
    expect(onSave).toHaveBeenCalledWith('example.org');
  });
});

describe('format', () => {
  it('builds contact links', () => {
    expect(contactHref({ kind: 'phone', value: '+49 221 555-01 42' })).toBe('tel:+492215550142');
    expect(contactHref({ kind: 'email', value: 'a@example.com' })).toBe('mailto:a@example.com');
    expect(contactHref({ kind: 'url', value: 'example.com' })).toBe('https://example.com');
    expect(contactHref({ kind: 'messenger', value: 'Signal' })).toBeNull();
  });

  it('formats addresses as lines', () => {
    expect(
      formatAddress({
        id: '1',
        label: null,
        street: 'Musterstraße 12',
        zip: '50667',
        city: 'Köln',
        region: null,
        country: 'DE',
      }),
    ).toEqual(['Musterstraße 12', '50667 Köln', 'DE']);
  });
});
