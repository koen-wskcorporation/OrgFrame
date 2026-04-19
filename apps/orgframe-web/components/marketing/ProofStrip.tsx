interface Stat {
  value: string;
  label: string;
}

export function ProofStrip({ stats }: { stats: ReadonlyArray<Stat> }) {
  return (
    <dl className="grid grid-cols-1 gap-10 border-y border-[hsl(var(--rule))] py-12 sm:grid-cols-3 md:gap-16 md:py-16">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-2 text-center sm:text-left">
          <dt className="eyebrow">{stat.label}</dt>
          <dd className="text-4xl font-semibold tracking-[-0.025em] text-[hsl(var(--ink))] md:text-5xl">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
