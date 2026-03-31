"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id?: string;
  value?: Date;
  onChange: (value: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-start px-3 text-left font-normal",
            !value && "text-zinc-400",
            className,
          )}
        >
          <span>{value ? format(value, "MM/dd/yyyy") : placeholder}</span>
          <CalendarDays className="ml-auto h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Calendar
          className="w-full"
          mode="single"
          selected={value}
          onSelect={(nextValue) => {
            onChange(nextValue);
            if (nextValue) {
              setOpen(false);
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
