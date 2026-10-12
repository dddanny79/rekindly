import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

/** Markdown of timeline entries. Raw HTML is not rendered (react-markdown default). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'font-serif text-read break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-foreground-2 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5',
        className,
      )}
    >
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
