import { Link, useNavigate } from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  Camera,
  Mail,
  MoreHorizontal,
  Phone,
  Star,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Person, Space } from '@app/shared';
import { Avatar } from '@/components/avatar';
import { FormMessage } from '@/components/form-field';
import { InlineText } from '@/components/inline-edit';
import { NameDialog } from '@/components/person/name-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { peopleApi, useWrite } from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceColor, spaceName } from '@/lib/labels';
import { cn } from '@/lib/utils';

/** “Leitung Einkauf @ Beispiel AG › Beispiel GmbH › Standort Köln” */
function MainAffiliation({ person }: { person: Person }) {
  const main = person.affiliations.find((a) => !a.endedOn);
  if (!main) return null;
  return (
    <p className="font-serif text-lg text-foreground-2 italic hyphens-manual md:text-deck">
      {main.role && <>{main.role} @ </>}
      {main.organization.path.map((step, index) => (
        <span key={step.id}>
          {index > 0 && ' › '}
          <Link
            to="/organizations/$organizationId"
            params={{ organizationId: step.id }}
            className="underline"
          >
            {step.name}
          </Link>
        </span>
      ))}
    </p>
  );
}

export function PersonHeader({ person, space }: { person: Person; space: Space | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = useWrite((patch: Record<string, unknown>) => peopleApi.update(person.id, patch));
  const photo = useWrite((file: File | null) =>
    file ? peopleApi.uploadPhoto(person.id, file) : peopleApi.removePhoto(person.id),
  );
  const remove = useWrite(() => peopleApi.remove(person.id), {
    onSuccess: () => void navigate({ to: '/people' }),
  });

  const phone =
    person.contactPoints.find((c) => c.kind === 'phone' && c.isPrimary) ??
    person.contactPoints.find((c) => c.kind === 'phone');
  const email =
    person.contactPoints.find((c) => c.kind === 'email' && c.isPrimary) ??
    person.contactPoints.find((c) => c.kind === 'email');

  return (
    <header className="rule-double pb-4">
      <div className="flex items-start gap-4 md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="kicker flex flex-wrap gap-x-2.5 text-muted-foreground">
            {space && <span style={{ color: spaceColor(space.color) }}>{spaceName(t, space)}</span>}
            {person.tags.map((tag) => (
              <span key={tag.id}>#{tag.name}</span>
            ))}
            {person.archivedAt && <span>{t('person.archived')}</span>}
          </div>
          <h1 className="mt-0.5">
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="cursor-text rounded-sm text-left font-serif text-title break-words hover:bg-muted md:text-display"
              aria-label={`${person.displayName}. ${t('person.name.edit')}`}
            >
              {person.displayName || t('people.unnamed')}
            </button>
          </h1>
          <MainAffiliation person={person} />
          <div className="mt-1.5">
            <InlineText
              label={t('person.summary')}
              value={person.summary}
              placeholder={t('person.summaryPlaceholder')}
              onSave={(value) => update.mutateAsync({ summary: value })}
              className="text-foreground-2"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="group relative block shrink-0 cursor-pointer rounded-full"
          aria-label={person.photoUrl ? t('person.photo.change') : t('person.photo.add')}
        >
          <Avatar
            initials={person.initials}
            photoUrl={person.photoUrl}
            color={space?.color}
            size={56}
            className="md:hidden"
          />
          <Avatar
            initials={person.initials}
            photoUrl={person.photoUrl}
            color={space?.color}
            size={92}
            className="hidden md:flex"
          />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-overlay opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera className="size-5 text-white" aria-hidden />
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) photo.mutate(file);
            e.target.value = '';
          }}
        />
      </div>

      <FormMessage tone="error">{photo.isError && errorMessage(t, photo.error)}</FormMessage>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {phone && (
          <Button asChild variant="secondary">
            <a href={`tel:${phone.value.replace(/\s/g, '')}`}>
              <Phone aria-hidden />
              {t('person.call')}
            </a>
          </Button>
        )}
        {email && (
          <Button asChild variant="secondary">
            <a href={`mailto:${email.value}`}>
              <Mail aria-hidden />
              {t('person.email')}
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          aria-pressed={person.favorite}
          onClick={() => update.mutate({ favorite: !person.favorite })}
        >
          <Star aria-hidden className={cn(person.favorite && 'fill-current text-signal')} />
          {person.favorite ? t('person.favorited') : t('person.favorite')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('common.more')}>
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditingName(true)}>
              {t('person.name.edit')}
            </DropdownMenuItem>
            {person.photoUrl && (
              <DropdownMenuItem onSelect={() => photo.mutate(null)}>
                {t('person.photo.remove')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => update.mutate({ archived: !person.archivedAt })}>
              {person.archivedAt ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {person.archivedAt ? t('person.unarchive') : t('person.archive')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden />
              {t('person.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NameDialog person={person} open={editingName} onOpenChange={setEditingName} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('person.deleteTitle', { name: person.displayName })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('person.deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(undefined)}>
              {t('person.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
