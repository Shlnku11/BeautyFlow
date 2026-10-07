import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils";

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>) { return <SelectPrimitive.Root data-slot="select" {...props} />; }
function SelectGroup({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) { return <SelectPrimitive.Group data-slot="select-group" className={cn("p-1", className)} {...props} />; }
function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>) { return <SelectPrimitive.Value data-slot="select-value" {...props} />; }
function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger data-slot="select-trigger" className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50", className)} {...props}>{children}<SelectPrimitive.Icon asChild><FontAwesomeIcon icon={faChevronDown} className="ml-2 h-3 w-3 opacity-50" aria-hidden="true" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>;
}
function SelectContent({ className, children, position = "popper", ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content data-slot="select-content" position={position} className={cn("relative z-50 max-h-60 min-w-[8rem] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md", className)} {...props}><SelectScrollUpButton /><SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport><SelectScrollDownButton /></SelectPrimitive.Content></SelectPrimitive.Portal>;
}
function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) { return <SelectPrimitive.Label data-slot="select-label" className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className)} {...props} />; }
function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item" className={cn("relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)} {...props}><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText><span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center"><SelectPrimitive.ItemIndicator><FontAwesomeIcon icon={faCheck} className="h-3 w-3" aria-hidden="true" /></SelectPrimitive.ItemIndicator></span></SelectPrimitive.Item>;
}
function SelectSeparator({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Separator>) { return <SelectPrimitive.Separator data-slot="select-separator" className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />; }
function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) { return <SelectPrimitive.ScrollUpButton data-slot="select-scroll-up-button" className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}><FontAwesomeIcon icon={faChevronUp} className="h-3 w-3" aria-hidden="true" /></SelectPrimitive.ScrollUpButton>; }
function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) { return <SelectPrimitive.ScrollDownButton data-slot="select-scroll-down-button" className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}><FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" aria-hidden="true" /></SelectPrimitive.ScrollDownButton>; }

export { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue };
