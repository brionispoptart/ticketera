import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

// Project-wide UX: pressing Enter in any Input auto-submits the parent form.
// This is intentional — single-field forms (login, search, etc.) should submit
// without requiring a visible submit button click.
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, onKeyDown, type, ...props }, ref) => {
  return (
    <input
      type={type}
      onKeyDown={(event) => {
        onKeyDown?.(event);

        if (
          event.defaultPrevented
          || event.key !== "Enter"
          || event.shiftKey
          || event.ctrlKey
          || event.metaKey
          || event.altKey
          || event.nativeEvent.isComposing
        ) {
          return;
        }

        const form = event.currentTarget.form;
        if (!form) {
          return;
        }

        event.preventDefault();
        form.requestSubmit();
      }}
      className={cn(
        "flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-400 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
