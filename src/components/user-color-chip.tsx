import { getUserColor } from "@/lib/user-color";
import { cn } from "@/lib/utils";

type UserColorChipProps = {
  label: string;
  seed: string;
  className?: string;
  labelClassName?: string;
  size?: "sm" | "md";
};

export function UserColorChip({
  label,
  seed,
  className,
  labelClassName,
  size = "md",
}: UserColorChipProps) {
  const color = getUserColor(seed);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border font-medium",
        size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      style={{
        borderColor: color.badgeBorderColor,
        backgroundColor: color.badgeBackgroundColor,
        color: color.badgeTextColor,
      }}
    >
      <span
        className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3", "rounded-full")}
        style={{ backgroundColor: color.dotColor }}
        aria-hidden="true"
      />
      <span className={cn("truncate", labelClassName)}>{label}</span>
    </span>
  );
}