import { nameSimilarity, normalizeDisplayName, normalizeEmail, normalizePhone } from "@/src/features/communications/normalization";
import type { CommContact, ContactCandidate, ContactMatchReasonCode, InboundIdentityHints } from "@/src/features/communications/types";

export type MatchScoringConfig = {
  autoLinkMinScore: number;
  autoLinkMinGap: number;
};

export const defaultMatchScoringConfig: MatchScoringConfig = {
  autoLinkMinScore: 98,
  autoLinkMinGap: 10
};

export function scoreContactCandidate(input: {
  contact: CommContact;
  hints: InboundIdentityHints;
  identityNormalizedValue: string | null;
}): ContactCandidate {
  const reasons: ContactMatchReasonCode[] = [];
  let score = 0;

  if (input.hints.authUserId && input.contact.authUserId === input.hints.authUserId) {
    reasons.push("authenticated_claim");
    score = Math.max(score, 100);
  }

  const hintEmail = normalizeEmail(input.hints.email);
  const hintPhone = normalizePhone(input.hints.phone);
  const contactEmail = normalizeEmail(input.contact.primaryEmail);
  const contactPhone = normalizePhone(input.contact.primaryPhone);

  if (hintEmail && contactEmail && hintEmail === contactEmail) {
    reasons.push("exact_primary_email");
    score = Math.max(score, 98);
  }

  if (hintPhone && contactPhone && hintPhone === contactPhone) {
    reasons.push("exact_primary_phone");
    score = Math.max(score, 98);
  }

  const identityNormalized = input.identityNormalizedValue;
  if (identityNormalized && contactEmail && identityNormalized === contactEmail) {
    reasons.push("exact_known_identity_email");
    score = Math.max(score, 98);
  }
  if (identityNormalized && contactPhone && identityNormalized === contactPhone) {
    reasons.push("exact_known_identity_phone");
    score = Math.max(score, 98);
  }

  const hintName = normalizeDisplayName(input.hints.displayName);
  if (hintName) {
    const similarity = nameSimilarity(hintName, input.contact.displayName);
    if (similarity >= 0.9) {
      reasons.push("name_similarity");
      score = Math.max(score, 45);
    } else if (similarity >= 0.55) {
      reasons.push("weak_display_name");
      score = Math.max(score, 30);
    }
  }

  return {
    contact: input.contact,
    score,
    reasons
  };
}

export function rankContactCandidates(input: {
  contacts: CommContact[];
  hints: InboundIdentityHints;
  identityNormalizedValue: string | null;
}): ContactCandidate[] {
  return input.contacts
    .map((contact) =>
      scoreContactCandidate({
        contact,
        hints: input.hints,
        identityNormalizedValue: input.identityNormalizedValue
      })
    )
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.contact.displayName.localeCompare(right.contact.displayName));
}

export function pickAutoLinkCandidate(candidates: ContactCandidate[], config: MatchScoringConfig = defaultMatchScoringConfig) {
  const [top, second] = candidates;
  if (!top) {
    return null;
  }

  if (top.score < config.autoLinkMinScore) {
    return null;
  }

  if (second && top.score - second.score < config.autoLinkMinGap) {
    return null;
  }

  return top;
}
