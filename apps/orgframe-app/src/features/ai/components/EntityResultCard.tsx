"use client";

import Link from "next/link";
import { CalendarDays, Clock3, User, Users } from "lucide-react";
import { Chip } from "@orgframe/ui/primitives/chip";
import { PersonCard } from "@orgframe/ui/primitives/person-card";
import { AccountProfileCard } from "@/src/features/core/account/components/AccountProfileCard";
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

function metadataString(card: AiResultCard, key: string) {
  const value = card.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function fieldValue(card: AiResultCard, label: string) {
  const field = card.fields?.find((candidate) => candidate.label.toLowerCase() === label.toLowerCase());
  return field?.value ?? null;
}

function wrapCardHref(card: AiResultCard, content: React.ReactNode) {
  if (!card.href) {
    return content;
  }

  return <Link href={card.href}>{content}</Link>;
}

function AccountResultCard({ card }: EntityResultCardProps) {
  const firstName = metadataString(card, "firstName");
  const lastName = metadataString(card, "lastName");
  const email = metadataString(card, "email") ?? fieldValue(card, "Email");
  const avatarPath = metadataString(card, "avatarPath");
  const avatarUrl = metadataString(card, "avatarUrl");

  return wrapCardHref(
    card,
    <AccountProfileCard
      allowEdit={false}
      avatarPath={avatarPath}
      avatarUrl={avatarUrl}
      className="border-border/80 bg-surface-muted/30 shadow-none"
      description={card.subtitle ?? "Account"}
      email={email}
      firstName={firstName}
      lastName={lastName}
      title={card.title}
    />
  );
}

function ProfileResultCard({ card }: EntityResultCardProps) {
  const firstName = metadataString(card, "firstName");
  const lastName = metadataString(card, "lastName");
  const fullNameFromFields = [firstName, lastName].filter(Boolean).join(" ").trim();
  const subtitle = card.subtitle ?? "Profile";
  const badges = [
    <Chip status={false} key={`${card.id}:type`} variant="neutral">
      Profile
    </Chip>,
    ...(card.badges ?? []).map((badge) => (
      <Chip status={false} key={`${card.id}:${badge}`} variant="neutral">
        {badge}
      </Chip>
    ))
  ];

  return wrapCardHref(
    card,
    <PersonCard
      badges={badges}
      className="border-border/80 bg-surface-muted/30 shadow-none"
      name={fullNameFromFields.length > 0 ? fullNameFromFields : card.title}
      sections={
        card.fields?.length
          ? [
              {
                key: "details",
                title: "Details",
                content: (
                  <div className="space-y-1 text-sm">
                    {card.fields.map((field) => (
                      <p key={`${card.id}:${field.label}`}>
                        <span className="font-semibold">{field.label}:</span> {field.value}
                      </p>
                    ))}
                  </div>
                )
              }
            ]
          : []
      }
      subtitle={subtitle}
    />
  );
}

export function EntityResultCard({ card }: EntityResultCardProps) {
  if (card.type === "account") {
    return <AccountResultCard card={card} />;
  }

  if (card.type === "player") {
    return <ProfileResultCard card={card} />;
  }

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
        <Chip className="normal-case tracking-normal">
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
            <Chip className="normal-case tracking-normal" key={`${card.id}:${badge}`}>
              {badge}
            </Chip>
          ))}
        </div>
      ) : null}
    </article>
  );

  return wrapCardHref(card, content);
}
