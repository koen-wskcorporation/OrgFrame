// Fixed color palette for user-defined status chips.
// Slugs are persisted in the database; do not rename without a migration.

export type StatusColor =
  | "slate"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "fuchsia"
  | "pink"
  | "rose";

export type StatusColorDef = {
  slug: StatusColor;
  label: string;
  // Tailwind class strings — must be string literals so the JIT scanner picks them up.
  chip: string;
  dot: string;
  swatch: string;
};

export const STATUS_COLORS: readonly StatusColorDef[] = [
  { slug: "slate", label: "Slate", chip: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200", dot: "bg-slate-500", swatch: "bg-slate-500" },
  { slug: "red", label: "Red", chip: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300", dot: "bg-red-500", swatch: "bg-red-500" },
  { slug: "orange", label: "Orange", chip: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300", dot: "bg-orange-500", swatch: "bg-orange-500" },
  { slug: "amber", label: "Amber", chip: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300", dot: "bg-amber-500", swatch: "bg-amber-500" },
  { slug: "yellow", label: "Yellow", chip: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500", swatch: "bg-yellow-500" },
  { slug: "lime", label: "Lime", chip: "border-lime-500/30 bg-lime-500/10 text-lime-700 dark:text-lime-300", dot: "bg-lime-500", swatch: "bg-lime-500" },
  { slug: "green", label: "Green", chip: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300", dot: "bg-green-500", swatch: "bg-green-500" },
  { slug: "emerald", label: "Emerald", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", swatch: "bg-emerald-500" },
  { slug: "teal", label: "Teal", chip: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300", dot: "bg-teal-500", swatch: "bg-teal-500" },
  { slug: "sky", label: "Sky", chip: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300", dot: "bg-sky-500", swatch: "bg-sky-500" },
  { slug: "blue", label: "Blue", chip: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300", dot: "bg-blue-500", swatch: "bg-blue-500" },
  { slug: "indigo", label: "Indigo", chip: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500", swatch: "bg-indigo-500" },
  { slug: "violet", label: "Violet", chip: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300", dot: "bg-violet-500", swatch: "bg-violet-500" },
  { slug: "fuchsia", label: "Fuchsia", chip: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300", dot: "bg-fuchsia-500", swatch: "bg-fuchsia-500" },
  { slug: "pink", label: "Pink", chip: "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300", dot: "bg-pink-500", swatch: "bg-pink-500" },
  { slug: "rose", label: "Rose", chip: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300", dot: "bg-rose-500", swatch: "bg-rose-500" }
];

const STATUS_COLOR_BY_SLUG: Record<StatusColor, StatusColorDef> = STATUS_COLORS.reduce(
  (acc, def) => {
    acc[def.slug] = def;
    return acc;
  },
  {} as Record<StatusColor, StatusColorDef>
);

const FALLBACK = STATUS_COLOR_BY_SLUG.slate;

export function resolveStatusColor(slug: string | null | undefined): StatusColorDef {
  if (slug && slug in STATUS_COLOR_BY_SLUG) {
    return STATUS_COLOR_BY_SLUG[slug as StatusColor];
  }
  return FALLBACK;
}

export function isStatusColor(value: string): value is StatusColor {
  return value in STATUS_COLOR_BY_SLUG;
}
