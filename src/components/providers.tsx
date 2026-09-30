"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { appTransition } from "@/lib/motion";

const loadFeatures = () => import("@/lib/motion-features").then((mod) => mod.default);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user" transition={appTransition}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
