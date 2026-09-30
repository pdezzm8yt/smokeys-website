import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "group/btn relative inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none " +
  "transition-[background-color,color,box-shadow,transform] duration-(--default-transition-duration) ease-standard " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[0_0_0_1px_oklch(1_0_0/0.15)_inset,0_8px_30px_-8px_var(--primary)] " +
    "hover:shadow-[0_0_0_1px_oklch(1_0_0/0.25)_inset,0_10px_44px_-6px_var(--primary)] hover:bg-[oklch(0.84_0.15_72)]",
  secondary:
    "bg-white/8 text-foreground ring-1 ring-white/20 ring-inset backdrop-blur-md hover:bg-white/14 hover:ring-white/35",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-white/6",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: string;
  variant?: Variant;
  size?: Size;
};

/** A link styled as a button. Hash links stay plain anchors; routes use next/link. */
export function ButtonLink({ href, variant, size, className, ...props }: ButtonLinkProps) {
  const classes = buttonClasses({ variant, size, className });
  if (href.startsWith("#") || href.startsWith("tel:") || href.startsWith("mailto:")) {
    return <a href={href} className={classes} {...props} />;
  }
  return <Link href={href} className={classes} {...props} />;
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
