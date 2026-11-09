import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders AI-written markdown. Raw HTML is never enabled (no rehype-raw), so
 * model output cannot inject markup; links open in a new tab without referrer.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed break-words [&_strong]:font-semibold", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: (props) => <h3 className="text-section" {...props} />,
          h2: (props) => <h3 className="text-section" {...props} />,
          h3: (props) => <h4 className="font-semibold" {...props} />,
          h4: (props) => <h4 className="font-medium" {...props} />,
          ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
          a: ({ href, ...props }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-link underline underline-offset-4" {...props} />
          ),
          code: ({ className: codeClass, ...props }) => (
            <code className={cn("rounded-[3px] bg-muted px-1 py-0.5 font-mono text-[0.85em]", codeClass)} {...props} />
          ),
          pre: (props) => <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0" {...props} />,
          table: (props) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs" {...props} />
            </div>
          ),
          th: (props) => <th className="border-b px-2 py-1 font-medium" {...props} />,
          td: (props) => <td className="border-b px-2 py-1 align-top" {...props} />,
          blockquote: (props) => <blockquote className="pl-4 text-muted-foreground italic" {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
