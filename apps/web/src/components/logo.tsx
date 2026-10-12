import { APP_NAME } from '@app/shared';
import mark from '@/assets/brand/mark.png';
import subtitleDark from '@/assets/brand/subtitle-dark.png';
import subtitleLight from '@/assets/brand/subtitle-light.png';
import wordmarkDark from '@/assets/brand/wordmark-dark.png';
import wordmarkLight from '@/assets/brand/wordmark-light.png';
import { cn } from '@/lib/utils';

const SOURCES = {
  wordmark: { light: wordmarkLight, dark: wordmarkDark },
  subtitle: { light: subtitleLight, dark: subtitleDark },
} as const;

/**
 * The Rekindly logo: `mark` (the sign only), `wordmark` (with the name) or
 * `subtitle` (name and “Personal CRM”). Lettering in light or dark mode follows
 * the theme. Size it with a height class.
 */
export function Logo({
  variant,
  className,
}: {
  variant: 'mark' | 'wordmark' | 'subtitle';
  className?: string;
}) {
  if (variant === 'mark') {
    return (
      <img
        src={mark}
        alt={APP_NAME}
        className={cn('w-auto select-none', className)}
        draggable={false}
      />
    );
  }
  const { light, dark } = SOURCES[variant];
  return (
    <>
      <img
        src={light}
        alt={APP_NAME}
        className={cn('w-auto select-none dark:hidden', className)}
        draggable={false}
      />
      <img
        src={dark}
        alt=""
        aria-hidden
        className={cn('hidden w-auto select-none dark:block', className)}
        draggable={false}
      />
    </>
  );
}
