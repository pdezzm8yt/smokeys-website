import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SceneProps = {
  id: string;
  /** The id of the scene's heading (or give `label`). */
  labelledBy?: string;
  label?: string;
  /** On the <section>: e.g. a wider scene sideways (`world:w-[150vw]`). */
  className?: string;
  /** On the glass panel. */
  panelClassName?: string;
  /**
   * Sideways, the scene is as wide as its panel's content (at least the
   * screen) instead of exactly the screen: for scenes laid out ALONG the world
   * (columns side by side) rather than stacked. Give the panel's content
   * explicit column widths (never max-content text).
   */
  wide?: boolean;
  children: ReactNode;
};

/**
 * One scene of the world (./world.tsx): a glass panel floating over the living
 * sky (the sky shows around it and, on large screens, softly through it).
 * data-panel keeps clicks on it from reaching the sky's sun and moon;
 * data-scene makes it a stop for the world's keys, the nav's "you are here"
 * and the remembered place.
 *
 * Down the page (a column: short screens, no JS) it's a classic stacked
 * section. Sideways it fills the screen's height between the header and the
 * road (globals.css: --road-h) and its width (or more, for a scene laid out
 * along the world); the panel scrolls within itself only as a safety net, if
 * its content can't fit the screen.
 */
export function Scene({ id, labelledBy, label, className, panelClassName, wide = false, children }: SceneProps) {
  return (
    <section
      id={id}
      data-scene
      aria-labelledby={labelledBy}
      aria-label={label}
      className={cn(
        "mx-auto max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8",
        "world:mx-0 world:flex world:h-full world:max-w-none world:flex-none world:items-center world:px-3 world:pt-[calc(var(--header-h)+0.75rem)] world:pb-[calc(var(--road-h)+0.75rem)] sm:world:px-5 lg:world:px-8",
        wide ? "world:w-max world:min-w-screen world:justify-center" : "world:w-screen",
        className,
      )}
    >
      <div
        data-panel
        className={cn(
          "glass rounded-[1.75rem] px-5 py-12 sm:px-10 sm:py-16 lg:px-14",
          "world:max-h-full world:overflow-y-auto world:overscroll-y-contain world:py-8 sm:world:py-10",
          wide ? "world:w-max" : "world:w-full",
          panelClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
