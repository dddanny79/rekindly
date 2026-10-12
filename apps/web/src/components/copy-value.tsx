import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** A value to copy (password, token, command), with a copy button. */
export function CopyValue({
  label,
  value,
  code = false,
}: {
  label: string;
  value: string;
  /** Commands and configuration: smaller, monospace, keeps line breaks. */
  code?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 border-b py-2">
      <div className="min-w-0">
        <div className="text-meta text-muted-foreground">{label}</div>
        <div
          data-copy-value
          className={cn(
            'break-all',
            code
              ? 'font-mono text-xs whitespace-pre-wrap'
              : 'num text-base font-semibold tracking-wide',
          )}
        >
          {value}
        </div>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={t('sync.copy', { what: label })}
        onClick={() =>
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}
