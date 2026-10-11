import { useQuery } from '@tanstack/react-query';
import { KeyRound, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Passkey } from '@app/shared';
import { FormMessage } from '@/components/form-field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/segmented-control';
import {
  instanceSettingsQuery,
  passkeysAvailable,
  passkeysQuery,
  useAddPasskey,
  useDeletePasskey,
  useRenamePasskey,
  useUpdateInstanceSettings,
} from '@/lib/auth';
import { guessDeviceName } from '@/lib/device';
import { errorMessage } from '@/lib/errors';

function useFormatDate() {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  return (iso: string) => format.format(new Date(iso));
}

function PasskeyRow({ passkey }: { passkey: Passkey }) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const rename = useRenamePasskey();
  const remove = useDeletePasskey();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(passkey.name);

  function onRename(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    rename.mutate({ id: passkey.id, name: name.trim() }, { onSuccess: () => setEditing(false) });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-2.5">
      <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {editing ? (
        <form onSubmit={onRename} className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            aria-label={t('passkeys.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            autoFocus
            className="max-w-64 flex-1"
          />
          <Button type="submit" size="sm" disabled={rename.isPending}>
            {t('passkeys.save')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setName(passkey.name);
              setEditing(false);
            }}
          >
            {t('passkeys.cancel')}
          </Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{passkey.name}</div>
            <div className="num text-meta text-muted-foreground">
              {t('passkeys.added', { date: formatDate(passkey.createdAt) })}
              {passkey.lastUsedAt &&
                ` · ${t('passkeys.lastUsed', { date: formatDate(passkey.lastUsedAt) })}`}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t('passkeys.rename')}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost">
                {t('passkeys.delete')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('passkeys.deleteTitle', { name: passkey.name })}
                </AlertDialogTitle>
                <AlertDialogDescription>{t('passkeys.deleteBody')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel variant="secondary">{t('passkeys.cancel')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => remove.mutate(passkey.id)}>
                  {t('passkeys.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}

/** On/off switch plus, when on, the passkey list. */
export function PasskeySettings() {
  const { t } = useTranslation();
  const settings = useQuery(instanceSettingsQuery);
  const update = useUpdateInstanceSettings();
  if (!settings.data) return null;
  const enabled = settings.data.passkeysEnabled;

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label={t('passkeys.toggle')}
        value={enabled ? 'on' : 'off'}
        options={[
          { value: 'off', label: t('passkeys.off') },
          { value: 'on', label: t('passkeys.on') },
        ]}
        onChange={(value) => update.mutate({ passkeysEnabled: value === 'on' })}
        className="max-w-60"
      />
      <FormMessage tone="error">{update.isError && errorMessage(t, update.error)}</FormMessage>
      {enabled ? (
        <PasskeyList />
      ) : (
        <p className="text-meta text-muted-foreground">{t('passkeys.disabledHint')}</p>
      )}
    </div>
  );
}

function PasskeyList() {
  const { t } = useTranslation();
  const passkeys = useQuery(passkeysQuery);
  const add = useAddPasskey();
  const available = passkeysAvailable();

  return (
    <div className="flex flex-col gap-3">
      {passkeys.data && passkeys.data.length > 0 ? (
        <ul className="border-t" aria-label={t('passkeys.title')}>
          {passkeys.data.map((passkey) => (
            <PasskeyRow key={passkey.id} passkey={passkey} />
          ))}
        </ul>
      ) : (
        passkeys.isSuccess && <p className="text-sm text-muted-foreground">{t('passkeys.empty')}</p>
      )}
      {available ? (
        <Button
          variant="secondary"
          className="self-start"
          disabled={add.isPending}
          onClick={() => add.mutate(guessDeviceName() ?? t('passkeys.defaultName'))}
        >
          <Plus aria-hidden />
          {t('passkeys.add')}
        </Button>
      ) : (
        <p className="text-meta text-muted-foreground">{t('passkeys.unavailable')}</p>
      )}
      <FormMessage tone="error">{add.isError && errorMessage(t, add.error)}</FormMessage>
    </div>
  );
}
