import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  APP_NAME,
  themeVariables,
  type PersonSection,
  type ResolvedLayout,
  type Theme,
} from '@app/shared';
import { cn } from '@/lib/utils';

/** Size of the miniature page before it is scaled to the card. */
const WIDTH = 800;
const HEIGHT = 500;

/** Scales the fixed-size page to the width of its box. */
function useScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const update = () => setScale(box.clientWidth / WIDTH || 0.3);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('kicker mb-1.5 border-b border-border-strong pb-1 text-[10px]', className)}>
      {children}
    </p>
  );
}

function Section({ id }: { id: PersonSection }) {
  const { t } = useTranslation();
  const title = <Kicker>{t(`appearance.sections.${id}`)}</Kicker>;
  const row = (label: string, value: ReactNode) => (
    <div className="flex gap-3 border-b py-1 text-[11px]">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
  switch (id) {
    case 'briefing':
      return (
        <div>
          {title}
          <div className="flex items-start gap-2 border-b py-1.5">
            <span className="mt-0.5 size-3 shrink-0 rounded-xs border border-input" />
            <span className="text-xs leading-tight">
              <span className="block font-semibold">{t('appearance.sample.followUp')}</span>
              <span className="font-semibold text-signal">{t('appearance.sample.due')}</span>
            </span>
          </div>
          <p className="border-b py-1 text-[11px]">{t('appearance.sample.fact')}</p>
          <p className="py-1 text-[11px] text-foreground-2">{t('appearance.sample.note')}</p>
        </div>
      );
    case 'timeline':
      return (
        <div>
          {title}
          <div className="h-10 rounded-sm border border-foreground bg-popover px-2 py-1.5 font-serif text-[11px] text-muted-foreground italic">
            {t('appearance.sample.composer')}
          </div>
          <div className="mt-2 flex gap-3 border-b pb-2">
            <span className="w-12 shrink-0 text-[10px] font-semibold">09.10.</span>
            <span className="font-serif text-[13px] leading-snug">
              {t('appearance.sample.note')}
            </span>
          </div>
        </div>
      );
    case 'contact':
      return (
        <div>
          {title}
          {row(t('appearance.sample.work'), <u>maya.chen@example.com</u>)}
          {row(t('appearance.sample.mobile'), <u>+1 415 555 0142</u>)}
        </div>
      );
    case 'facts':
      return (
        <div>
          {title}
          <p className="border-b py-1 text-[11px]">{t('appearance.sample.fact')}</p>
          <p className="border-b py-1 text-[11px]">{t('appearance.sample.fact2')}</p>
        </div>
      );
    case 'relationships':
      return (
        <div>
          {title}
          {row(t('seed.relationshipTypes.colleague'), <u>Jonas Weber</u>)}
        </div>
      );
    case 'organizations':
      return (
        <div>
          {title}
          {row(t('appearance.sample.role'), <u>Northwind Labs</u>)}
        </div>
      );
    case 'tags':
      return (
        <div>
          {title}
          <span className="inline-block rounded-sm border px-1.5 text-[10px]">#pilot</span>
        </div>
      );
    default:
      return (
        <div>
          {title}
          <span className="block h-1.5 w-2/3 rounded-xs bg-muted" />
        </div>
      );
  }
}

/**
 * A miniature person page in a given theme, mode and layout: what the theme and
 * layout cards show, drawn live so it also works for themes made on this instance.
 */
export function PagePreview({
  theme,
  layout,
  mode,
}: {
  theme: Theme;
  layout: ResolvedLayout;
  mode: 'light' | 'dark';
}) {
  const { t } = useTranslation();
  const { ref, scale } = useScale();
  const visible = layout.sections.filter((s) => !s.hidden);
  const column = (list: typeof visible) => (
    <div className="flex min-w-0 flex-col gap-4">
      {list.map((s) => (
        <Section key={s.id} id={s.id} />
      ))}
    </div>
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className="relative w-full overflow-hidden rounded-sm border"
      style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    >
      <div
        className="pointer-events-none absolute top-0 left-0 flex bg-background font-sans text-foreground select-none"
        style={
          {
            width: WIDTH,
            height: HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            ...themeVariables(theme, mode),
          } as CSSProperties
        }
      >
        <div className="w-[150px] shrink-0 border-r p-3">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <span className="size-3 rounded-full bg-signal" />
            {APP_NAME}
          </p>
          <p className="mt-3 h-7 rounded-sm border border-input bg-popover px-2 text-[11px] leading-7 text-muted-foreground">
            {t('nav.search')}
          </p>
          <ul className="mt-3 text-xs">
            <li className="px-2 py-1.5">{t('nav.today')}</li>
            <li className="bg-muted px-2 py-1.5 font-bold shadow-[inset_2px_0_0_var(--signal)]">
              {t('nav.people')}
            </li>
            <li className="px-2 py-1.5">{t('nav.organizations')}</li>
            <li className="px-2 py-1.5">{t('nav.settings')}</li>
          </ul>
          <ul className="mt-4 text-xs">
            <li className="flex items-center gap-1.5 px-2 py-1">
              <span className="size-2 rounded-full bg-area-private" />
              {t('seed.spaces.private')}
            </li>
            <li className="flex items-center gap-1.5 px-2 py-1">
              <span className="size-2 rounded-full bg-area-business" />
              {t('seed.spaces.business')}
            </li>
          </ul>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden px-6 pt-5">
          <p className="kicker text-[10px] text-area-business">{t('appearance.sample.kicker')}</p>
          <p className="mt-0.5 font-serif text-[36px] leading-none font-medium tracking-tight">
            {t('appearance.sample.name')}
          </p>
          <p className="mt-1 font-serif text-[15px] text-foreground-2 italic">
            {t('appearance.sample.deck')}
          </p>
          <div className="mt-2.5 flex gap-2">
            <span className="rounded-sm border border-input px-2.5 py-1 text-[11px]">
              {t('appearance.sample.call')}
            </span>
            <span className="rounded-sm border border-input px-2.5 py-1 text-[11px]">
              {t('appearance.sample.email')}
            </span>
          </div>
          <div className="rule-double mt-3" />
          {layout.columns === 2 ? (
            <div
              className={cn(
                'mt-4 grid gap-5',
                layout.sideWidth === 'wide' ? 'grid-cols-2' : 'grid-cols-[1fr_190px]',
              )}
            >
              {column(visible.filter((s) => s.column === 'main'))}
              <div className="border-l pl-4">
                {column(visible.filter((s) => s.column === 'side'))}
              </div>
            </div>
          ) : (
            <div className="mt-4">{column(visible)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
