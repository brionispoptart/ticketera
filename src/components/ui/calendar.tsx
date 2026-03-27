"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("relative w-full p-3", className)}
      classNames={{
        months: "space-y-4",
        month: "space-y-4",
        month_caption: "flex items-center justify-center pt-1",
        caption_label: "text-sm font-semibold text-zinc-100",
        nav: "absolute inset-x-3 top-3 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-7 w-7 border-zinc-700 bg-zinc-900/90 p-0 text-lime-300 opacity-90 hover:border-lime-500/40 hover:bg-zinc-800 hover:text-lime-200",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-7 w-7 border-zinc-700 bg-zinc-900/90 p-0 text-lime-300 opacity-90 hover:border-lime-500/40 hover:bg-zinc-800 hover:text-lime-200",
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex w-full",
        weekday: "flex-1 text-center text-[0.8rem] font-medium text-zinc-500",
        week: "mt-2 flex w-full",
        day: "h-9 flex-1 p-0 text-center text-sm",
        day_button: "h-9 w-full rounded-md p-0 font-normal text-zinc-100 aria-selected:opacity-100 hover:bg-zinc-800 hover:text-zinc-50",
        selected:
          "bg-lime-400/15 text-lime-200 ring-1 ring-lime-400/30 [&>button]:font-semibold [&>button]:text-lime-100 [&>button:hover]:bg-transparent [&>button:hover]:text-lime-50 [&>button:focus]:bg-transparent [&>button:focus]:text-lime-50",
        today:
          "bg-zinc-800/90 text-zinc-100 ring-1 ring-zinc-700 [&>button]:text-zinc-100 [&>button:hover]:bg-transparent [&>button:hover]:text-zinc-50",
        outside: "text-zinc-500 opacity-50",
        disabled: "text-zinc-600 opacity-50",
        hidden: "invisible",
        chevron: "h-4 w-4 fill-none stroke-current",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("h-4 w-4", chevronClassName)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn("h-4 w-4", chevronClassName)} {...chevronProps} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };