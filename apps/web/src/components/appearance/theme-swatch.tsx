import { themeSwatches, type Theme } from '@app/shared';

/** Light and dark half of a theme: background, text, signal and space colours. */
export function ThemeSwatch({ theme }: { theme: Theme }) {
  return (
    <div aria-hidden className="grid h-14 grid-cols-2 overflow-hidden rounded-sm border">
      {(['light', 'dark'] as const).map((mode) => {
        const s = themeSwatches(theme, mode);
        return (
          <div
            key={mode}
            className="flex flex-col justify-between p-2"
            style={{ background: s.background }}
          >
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-8 rounded-full" style={{ background: s.foreground }} />
              <span className="h-1.5 w-4 rounded-full" style={{ background: s.signal }} />
            </div>
            <div className="flex gap-1">
              {s.spaces.map((color, i) => (
                <span key={i} className="size-2.5 rounded-full" style={{ background: color }} />
              ))}
              <span className="ml-auto h-2.5 w-6 rounded-[2px]" style={{ background: s.muted }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
