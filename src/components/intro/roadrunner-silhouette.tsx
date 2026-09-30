import { cn } from "@/lib/cn";

/**
 * Backlit roadrunner silhouette (PLACEHOLDER for licensed footage).
 * Anatomy follows a real greater roadrunner: long straight tail, shaggy crest,
 * long bill, long legs. `data-zoom-target` marks the head: the camera push
 * into Scene 2 zooms toward it so the mascot "match cuts" into place.
 */
export function RoadrunnerSilhouette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 560 400"
      className={cn(
        "overflow-visible [filter:drop-shadow(0_0_1.5px_rgb(255_200_130/0.95))_drop-shadow(0_0_22px_rgb(255_140_60/0.35))]",
        className,
      )}
      aria-hidden="true"
    >
      <g fill="#0b0808">
        {/* Tail, angled up and back, with feathered tip */}
        <g className="origin-[250px_215px] [transform-box:view-box] motion-safe:animate-[bob_3.4s_ease-in-out_infinite_alternate]">
          <path d="M252 214 L234 198 L78 96 Q46 74 26 86 Q12 100 30 114 L62 128 L224 230 Z" />
          <path d="M44 84 L16 76 L24 90 L8 94 L26 104 L12 112 L40 114 Z" />
        </g>
        {/* Body */}
        <ellipse cx="300" cy="226" rx="88" ry="44" transform="rotate(-14 300 226)" />
        {/* Neck + head (gentle bob) */}
        <g className="origin-[350px_210px] [transform-box:view-box] motion-safe:animate-bob">
          <path d="M340 196 Q362 158 392 140 L420 150 Q408 182 378 222 L352 236 Z" />
          <ellipse cx="416" cy="138" rx="31" ry="25" data-zoom-target />
          {/* Shaggy crest */}
          <path d="M392 124 L372 90 L398 116 L394 80 L412 112 L420 82 L426 114 L440 94 L436 124 Z" />
          {/* Long bill */}
          <path d="M442 128 Q490 134 532 146 Q490 150 442 150 Z" />
          {/* Eye catchlight */}
          <circle cx="428" cy="132" r="3.2" fill="#ffcf8a" opacity="0.9" />
          <path d="M432 132 Q444 136 452 142" stroke="#ffb46a" strokeOpacity="0.35" strokeWidth="2" fill="none" />
        </g>
        {/* Wing streaks catch the rim light */}
        <g stroke="#ffb46a" strokeOpacity="0.18" strokeWidth="2" fill="none">
          <path d="M240 214 Q290 196 350 204" />
          <path d="M236 230 Q290 214 352 222" />
          <path d="M246 246 Q292 234 340 238" />
        </g>
        {/* Legs */}
        <g stroke="#0b0808" strokeWidth="7" strokeLinecap="round" fill="none">
          <path d="M290 262 L280 326 L262 372" />
          <path d="M320 260 L338 322 L354 372" />
          <path d="M262 372 L238 376 M262 372 L284 380 M354 372 L380 374 M354 372 L338 382" strokeWidth="5" />
        </g>
      </g>
    </svg>
  );
}
