type Decoration = {
  left: string;
  top: string;
  size: number;
  rotate: number;
  icon: "soccer" | "basketball" | "baseball" | "tennis" | "volleyball" | "football";
};

const DECORATIONS: Decoration[] = [
  { left: "8%", top: "14%", size: 96, rotate: -12, icon: "soccer" },
  { left: "86%", top: "10%", size: 72, rotate: 18, icon: "tennis" },
  { left: "72%", top: "30%", size: 120, rotate: -8, icon: "basketball" },
  { left: "16%", top: "68%", size: 108, rotate: 10, icon: "volleyball" },
  { left: "90%", top: "74%", size: 84, rotate: -18, icon: "baseball" },
  { left: "40%", top: "86%", size: 140, rotate: 14, icon: "football" },
  { left: "4%", top: "40%", size: 64, rotate: 22, icon: "basketball" },
  { left: "62%", top: "6%", size: 60, rotate: -22, icon: "baseball" }
];

function SportIcon({ kind }: { kind: Decoration["icon"] }) {
  const stroke = "currentColor";
  const sw = 1.5;
  switch (kind) {
    case "soccer":
      return (
        <svg fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" />
          <path d="M24 8l9 6.5-3.4 10.5H18.4L15 14.5 24 8z" />
          <path d="M24 25.5l-9.5 6.8M24 25.5l9.5 6.8M15 14.5L5 18M33 14.5L43 18M18.4 25L13 40M29.6 25L35 40" />
        </svg>
      );
    case "basketball":
      return (
        <svg fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" />
          <path d="M4 24h40M24 4v40" />
          <path d="M9 9c6 4 6 26 0 30M39 9c-6 4-6 26 0 30" />
        </svg>
      );
    case "baseball":
      return (
        <svg fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" />
          <path d="M8.5 11c4 5 4 21 0 26M39.5 11c-4 5-4 21 0 26" strokeDasharray="3 3" />
        </svg>
      );
    case "tennis":
      return (
        <svg fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" />
          <path d="M6 16c8 2 16 8 18 18M42 32c-8-2-16-8-18-18" />
        </svg>
      );
    case "volleyball":
      return (
        <svg fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" />
          <path d="M24 4c-5 7-5 33 0 40M9 9c6 4 24 18 30 28M39 9c-6 4-24 18-30 28" />
        </svg>
      );
    case "football":
      return (
        <svg fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth={sw} viewBox="0 0 48 48">
          <path d="M8 24c0-10 6-16 16-16s16 6 16 16-6 16-16 16S8 34 8 24z" />
          <path d="M18 24h12M21 21v6M25 21v6M29 21v6" />
        </svg>
      );
  }
}

export function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden text-[hsl(var(--accent-foreground))]">
      {DECORATIONS.map((d, i) => (
        <span
          className="absolute opacity-[0.16]"
          key={i}
          style={{
            left: d.left,
            top: d.top,
            width: `${d.size}px`,
            height: `${d.size}px`,
            transform: `translate(-50%, -50%) rotate(${d.rotate}deg)`
          }}
        >
          <SportIcon kind={d.icon} />
        </span>
      ))}
    </div>
  );
}
