import { cn } from "@/lib/cn";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  lede?: string;
  id?: string;
  align?: "start" | "center";
  className?: string;
};

export function SectionHeading({ eyebrow, title, lede, id, align = "start", className }: SectionHeadingProps) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-4", align === "center" && "mx-auto items-center text-center", className)}>
      <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.22em] text-primary uppercase">
        <span aria-hidden="true" className="h-px w-8 bg-linear-to-r from-transparent to-primary" />
        {eyebrow}
      </p>
      <h2 id={id} className="font-display text-3xl leading-[1.1] font-bold tracking-tight sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {lede && <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{lede}</p>}
    </div>
  );
}
