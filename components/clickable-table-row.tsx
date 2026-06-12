"use client";

import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export function ClickableTableRow({
  href,
  className,
  children
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  function isInteractive(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("a,button,input,select,textarea,label,form,[role='menu']"));
  }

  return (
    <tr
      className={cn("table-row cursor-pointer", className)}
      tabIndex={0}
      aria-label="Open property"
      onClick={(event) => {
        if (!isInteractive(event.target)) router.push(href);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !isInteractive(event.target)) {
          event.preventDefault();
          router.push(href);
        }
      }}
    >
      {children}
    </tr>
  );
}
