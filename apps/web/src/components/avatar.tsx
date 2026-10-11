import type { SpaceColor } from '@app/shared';
import { spaceColor } from '@/lib/labels';
import { cn } from '@/lib/utils';

interface AvatarProps {
  initials: string;
  photoUrl: string | null;
  color?: SpaceColor | null;
  /** Diameter in px. */
  size?: number;
  className?: string;
}

/** Photo, or initials in Newsreader italic on the space colour (design). */
export function Avatar({ initials, photoUrl, color, size = 34, className }: AvatarProps) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        style={style}
        className={cn('shrink-0 rounded-full object-cover', className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: spaceColor(color) }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-serif text-background italic',
        className,
      )}
    >
      {initials || '?'}
    </span>
  );
}
