import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormMessage } from '@/components/form-field';
import { SettingsSection } from '@/components/settings-section';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  EXPORT_JSON_URL,
  exportVcfUrl,
  importExport,
  importStatusQuery,
  spacesQuery,
} from '@/lib/data';
import { errorMessage } from '@/lib/errors';
import { spaceName } from '@/lib/labels';

/** Settings › Data: full export (backup), vCard export, restore into an empty instance. */
export function DataSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: spaces = [] } = useQuery(spacesQuery);
  const { data: status } = useQuery(importStatusQuery);
  const [vcfSpace, setVcfSpace] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<Record<string, number> | null>(null);

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importExport(file);
      setDone(result.imported);
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsSection title={t('data.export.title')} lead={t('data.export.lead')}>
        <Button asChild>
          <a href={EXPORT_JSON_URL} download>
            <Download aria-hidden />
            {t('data.export.json')}
          </a>
        </Button>
      </SettingsSection>

      <SettingsSection title={t('data.vcf.title')} lead={t('data.vcf.lead')}>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label={t('spaces.label')}
            value={vcfSpace}
            onChange={(e) => setVcfSpace(e.target.value)}
            className="w-56"
          >
            <option value="">{t('sync.allSpaces')}</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {spaceName(t, s)}
              </option>
            ))}
          </Select>
          <Button variant="secondary" asChild>
            <a href={exportVcfUrl(vcfSpace || undefined)} download>
              <Download aria-hidden />
              {t('data.vcf.button')}
            </a>
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t('data.import.title')} lead={t('data.import.lead')}>
        {done ? (
          <p className="text-sm" role="status">
            {t('data.import.done', {
              people: done.people ?? 0,
              organizations: done.organizations ?? 0,
              entries: done.entries ?? 0,
            })}
          </p>
        ) : status && !status.empty ? (
          <p className="text-sm text-muted-foreground">{t('data.import.notEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="file"
              accept="application/json,.json"
              aria-label={t('data.import.file')}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <FormMessage tone="error">{error ? errorMessage(t, error) : null}</FormMessage>
            <Button
              className="self-start"
              disabled={!file || busy}
              onClick={() => void runImport()}
            >
              <Upload aria-hidden />
              {busy ? t('data.import.running') : t('data.import.button')}
            </Button>
          </div>
        )}
      </SettingsSection>
    </>
  );
}
