import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  // Design: docs/design.md › States › Buttons. Focus ring comes from the global :focus-visible.
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border text-sm whitespace-nowrap transition-colors disabled:pointer-events-none aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-foreground bg-foreground font-semibold text-background hover:border-foreground-2 hover:bg-foreground-2 disabled:border-border disabled:bg-muted disabled:text-muted-foreground',
        secondary:
          'border-input bg-transparent text-foreground hover:border-foreground hover:bg-muted disabled:border-dashed disabled:border-border disabled:text-muted-foreground',
        outline:
          'border-input bg-transparent text-foreground hover:border-foreground hover:bg-muted disabled:border-dashed disabled:border-border disabled:text-muted-foreground',
        ghost:
          'border-transparent bg-transparent text-foreground-2 hover:bg-muted hover:text-foreground disabled:text-muted-foreground disabled:line-through',
        destructive:
          'border-destructive bg-transparent font-semibold text-destructive hover:bg-destructive hover:text-background',
        link: 'border-transparent text-foreground underline underline-offset-3 hover:decoration-current',
      },
      size: {
        default: 'h-9 px-3.5',
        xs: "h-6 gap-1 px-2 text-meta [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1.5 px-2.5',
        lg: 'h-11 px-5',
        icon: 'size-9',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-8',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
