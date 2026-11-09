import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

/** A styled native <select>; works in plain GET forms without client JS. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        data-slot="native-select"
        className="h-9 w-full appearance-none rounded-md border border-input bg-card pr-8 pl-3 text-sm transition-[border-color,box-shadow] duration-200 outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50 dark:bg-transparent [&>option]:bg-popover"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </span>
  )
}

export { NativeSelect }
