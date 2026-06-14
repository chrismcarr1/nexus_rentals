import Image from "next/image";

import { cn } from "@/lib/utils";

export type NexusLogoVariant = "full" | "icon";
export type NexusLogoSize = "xs" | "sm" | "md" | "lg" | "xl";

export function NexusLogo({
  variant = "full",
  size = "md",
  className,
  priority = false
}: {
  variant?: NexusLogoVariant;
  size?: NexusLogoSize;
  className?: string;
  priority?: boolean;
}) {
  const icon = variant === "icon";

  return (
    <span
      className={cn(
        "nexus-logo",
        icon ? "nexus-logo-icon" : "nexus-logo-full",
        `nexus-logo-${size}`,
        className
      )}
    >
      <Image
        src={
          icon
            ? "/brand/nexus-house-icon-transparent.png"
            : "/brand/nexus-rentals-logo-transparent.png"
        }
        alt={icon ? "Nexus Rentals icon" : "Nexus Rentals"}
        width={icon ? 512 : 1320}
        height={icon ? 512 : 424}
        sizes={icon ? "80px" : "(max-width: 640px) 240px, 520px"}
        priority={priority}
      />
    </span>
  );
}
