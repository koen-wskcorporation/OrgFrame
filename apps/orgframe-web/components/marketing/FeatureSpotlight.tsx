import type { ReactNode } from "react";
import { Check } from "lucide-react";

interface FeatureSpotlightProps {
  eyebrow?: string;
  title: ReactNode;
  body: ReactNode;
  media?: ReactNode;
  side?: "left" | "right";
  bullets?: string[];
  id?: string;
}

export function FeatureSpotlight({ eyebrow, title, body, media, side = "right", bullets, id }: FeatureSpotlightProps) {
  const mediaFirst = side === "left";
  return (
    <div id={id} className="grid items-center gap-12 md:grid-cols-2 md:gap-16 lg:gap-24">
      <div className={`flex flex-col gap-6 ${mediaFirst ? "md:order-2" : ""}`}>
        {eyebrow ? <span className="eyebrow eyebrow-accent">{eyebrow}</span> : null}
        <h3 className="subhead">{title}</h3>
        <div className="max-w-xl text-[1.0625rem] leading-relaxed text-[hsl(var(--muted-ink))]">{body}</div>
        {bullets && bullets.length > 0 ? (
          <ul className="flex flex-col gap-3 pt-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-[0.95rem] text-[hsl(var(--ink))]">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[hsl(var(--rule-strong))] text-[hsl(var(--accent-ink))]">
                  <Check aria-hidden className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className={mediaFirst ? "md:order-1" : ""}>{media ?? <SpotlightPlaceholder />}</div>
    </div>
  );
}

export function SpotlightPlaceholder({ label }: { label?: string }) {
  return (
    <div
      aria-hidden
      className="relative aspect-[5/4] w-full overflow-hidden rounded-[28px] border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))]"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(135deg, hsl(var(--paper-2)) 0%, hsl(var(--paper-3)) 100%)"
        }}
      />
      <div className="paper-grid absolute inset-0 opacity-60" />
      <div className="absolute inset-0 flex items-end justify-start p-8">
        <div className="flex flex-col gap-2">
          <span className="eyebrow eyebrow-accent">{label ?? "Preview"}</span>
          <div className="h-2 w-40 rounded-full bg-[hsl(var(--rule-strong))]" />
          <div className="h-2 w-28 rounded-full bg-[hsl(var(--rule))]" />
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full"
        style={{ background: "radial-gradient(circle, hsl(var(--accent-bg) / 0.18) 0%, transparent 70%)" }}
      />
    </div>
  );
}
