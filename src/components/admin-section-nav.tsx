import Link from "next/link";
import { ArrowLeft, Clock3, History, KeyRound, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

type AdminSection = "users" | "logs" | "hours" | "settings";

const SECTIONS: Array<{
  id: AdminSection;
  href: string;
  label: string;
  icon: typeof ShieldCheck;
}> = [
  { id: "users", href: "/admin/users", label: "Users", icon: ShieldCheck },
  { id: "logs", href: "/admin/logs", label: "Audit logs", icon: History },
  { id: "hours", href: "/admin/hours", label: "Hours", icon: Clock3 },
  { id: "settings", href: "/admin/settings", label: "Settings", icon: KeyRound },
];

export function AdminSectionNav({ current, showDashboardLink = true }: { current: AdminSection; showDashboardLink?: boolean }) {
  return (
    <div className="flex w-full flex-nowrap items-center justify-start gap-2 overflow-x-auto">
      {showDashboardLink ? (
        <Link href="/" className={buttonVariants({ variant: "outline", className: "shrink-0 border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" })}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </Link>
      ) : null}
      {SECTIONS.map((section) => {
        const Icon = section.icon;
        const isCurrent = section.id === current;

        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={isCurrent ? "page" : undefined}
            className={buttonVariants({
              variant: "outline",
              className: isCurrent
                ? "shrink-0 border-lime-400/35 bg-lime-400/10 text-lime-100 hover:bg-lime-400/14"
                : "shrink-0 border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900",
            })}
          >
            <Icon className="mr-2 h-4 w-4" />
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}