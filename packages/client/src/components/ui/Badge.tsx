import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex h-5 w-fit items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", {
  variants: { variant: {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    destructive: "border-transparent bg-destructive text-destructive-foreground",
    outline: "border-border text-foreground",
    ghost: "border-transparent text-foreground",
    link: "border-transparent text-primary underline-offset-4 hover:underline",
  } },
  defaultVariants: { variant: "default" },
});

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";
function Badge({ className, variant, tone, asChild = false, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean; tone?: BadgeTone }) {
  const Component = asChild ? Slot.Root : "span";
  const toneClass = tone === "success" ? "border-success-bg bg-success-bg text-success-fg" : tone === "warning" ? "border-warning-bg bg-warning-bg text-warning-fg" : tone === "danger" ? "border-danger-bg bg-danger-bg text-danger-fg" : tone === "info" ? "border-info-bg bg-info-bg text-info-fg" : undefined;
  return <Component data-slot="badge" className={cn(badgeVariants({ variant: tone ? "outline" : variant }), toneClass, className)} {...props} />;
}

export { Badge, badgeVariants };
