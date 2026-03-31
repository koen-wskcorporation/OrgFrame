"use client";

import Link from "next/link";
import { CalendarDays, Clock3, User, Users } from "lucide-react";
import { Chip } from "@orgframe/ui/primitives/chip";
import type { AiResultCard } from "@/src/features/ai/types";

type EntityResultCardProps = {
  card: AiResultCard;
};

function iconForType(type: AiResultCard["type"]) {
  if (type === "player") {
    return User;
  }

  if (type === "account") {
    return Users;
  }

  if (type === "event") {
    return CalendarDays;
  }

  return Clock3;
}

export function EntityResultCard({ card }: EntityResultCardProps) {
  const Icon = iconForType(card.type);
  const content = (
    <article className="rounded-control border border-border/80 bg-surface-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-text">
            <Icon className="h-4 w-4 text-text-muted" />
            <span className="truncate">{card.title}</span>
          </p>
          {card.subtitle ? <p className="mt-0.5 text-xs text-text-muted">{card.subtitle}</p> : null}
        </div>
        <Chip className="normal-case tracking-normal" size="compact" variant="flat">
          {card.type}
        </Chip>
      </div>

      {card.fields?.length ? (
        <dl className="mt-2.5 space-y-1.5 text-xs">
          {card.fields.map((field) => (
            <div className="flex items-start justify-between gap-2" key={`${card.id}:${field.label}`}>
              <dt className="text-text-muted">{field.label}</dt>
              <dd className="text-right text-text">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {card.badges?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {card.badges.map((badge) => (
            <Chip className="normal-case tracking-normal" key={`${card.id}:${badge}`} size="compact" variant="flat">
              {badge}
            </Chip>
          ))}
        </div>
      ) : null}
    </article>
  );

  if (!card.href) {
    return content;
  }

  return (
    <Link href={card.href}>
      {content}
    </Link>
  );
}
