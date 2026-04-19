import { Building2, Trophy, Network, MapPin, type LucideIcon } from "lucide-react";

export type SolutionSlug = "clubs" | "leagues" | "associations" | "facilities";

export interface SolutionPain {
  pain: string;
  capability: string;
}

export interface SolutionDef {
  slug: SolutionSlug;
  name: string;
  headline: string;
  lede: string;
  summary: string;
  icon: LucideIcon;
  pains: SolutionPain[];
  quote: { body: string; attribution: string; role?: string };
}

export const SOLUTIONS: ReadonlyArray<SolutionDef> = [
  {
    slug: "clubs",
    name: "Clubs",
    headline: "For the club that's outgrown its spreadsheets.",
    summary: "Travel, rec, and academy — all in one roster, with registrations that don't drop off.",
    lede: "Clubs juggle tryouts, evaluations, travel teams, rec divisions, coaching assignments, payments, and family communication. OrgFrame is built to make all of that one coherent operation instead of twelve overlapping ones.",
    icon: Building2,
    pains: [
      { pain: "Registrations stall in checkout", capability: "A Stripe-native flow with saved progress, family discounts, and one profile per person." },
      { pain: "Coaching assignments live in someone's head", capability: "Coaches mapped to teams with the right access — nothing more, nothing less." },
      { pain: "Parents message the wrong person", capability: "A shared inbox per department; replies thread, never get lost." }
    ],
    quote: {
      body: "Registrations used to eat our March. This year, we opened on a Friday and had the travel program capped by Sunday.",
      attribution: "Club Director",
      role: "Northeast soccer club, OrgFrame beta partner"
    }
  },
  {
    slug: "leagues",
    name: "Leagues",
    headline: "For the league that answers to every member org.",
    summary: "Standings, schedules, rosters — and the operational reporting your board actually wants.",
    lede: "Leagues sit in a different chair than clubs. You're coordinating across orgs, setting policy, and answering questions at the board level. OrgFrame models that — with roll-ups, cross-org reporting, and a public site that makes the league look like the real institution it is.",
    icon: Trophy,
    pains: [
      { pain: "Standings are always a week behind", capability: "Schedules, scores, and standings that update the moment the score is entered." },
      { pain: "Board reporting is a monthly fire drill", capability: "Revenue, registrations, and program health rolled up across member orgs on demand." },
      { pain: "Public site looks like 2012", capability: "A Site Management stack built on live data — not a separate CMS your webmaster forgets to update." }
    ],
    quote: {
      body: "Our board meeting went from three days of prep to ninety minutes of review. The data is where it needs to be.",
      attribution: "League Commissioner",
      role: "Regional youth hockey league"
    }
  },
  {
    slug: "associations",
    name: "Associations",
    headline: "For the association managing policy, programs, and people.",
    summary: "Membership, certifications, events, and communications — governed properly.",
    lede: "Associations answer to members, not customers. That means membership renewals, certification tracking, policy communications, and events that have to go off without a hitch. OrgFrame handles the operations so your staff can focus on the mission.",
    icon: Network,
    pains: [
      { pain: "Membership renewals are a scramble every fall", capability: "Recurring dues, grace periods, and automated reminders — with a real audit trail." },
      { pain: "Certifications drift out of date", capability: "Per-person certifications with expiries, reminders, and required-before-eligible gating." },
      { pain: "Policy emails don't land", capability: "Targeted, trackable communications to the right membership segment, every time." }
    ],
    quote: {
      body: "Renewals used to be our whole fall. Now they run themselves and we can focus on the policy work.",
      attribution: "Executive Director",
      role: "State-level sports association"
    }
  },
  {
    slug: "facilities",
    name: "Facilities",
    headline: "For the facility that operates as its own business.",
    summary: "Bookings, rentals, public events, and billing — on infrastructure that scales with you.",
    lede: "A rink, complex, or field-house is a business with a schedule. OrgFrame treats it that way: spaces and sub-spaces, layered availability, external rentals with payment links, and reporting that respects the numbers you actually care about.",
    icon: MapPin,
    pains: [
      { pain: "Double bookings happen on the busiest weekends", capability: "Conflict detection that knows about sub-spaces, maintenance, and reservations." },
      { pain: "External rental invoicing is manual", capability: "Payment links, automatic holds, and revenue reports by space and time window." },
      { pain: "Public event pages don't exist", capability: "A page per event that families and visiting teams can actually use — directions, schedule, contact." }
    ],
    quote: {
      body: "We filled an extra 14% of our open ice this season just by making it easy to book.",
      attribution: "General Manager",
      role: "Independent ice facility"
    }
  }
];

export function getSolution(slug: string): SolutionDef | undefined {
  return SOLUTIONS.find((s) => s.slug === slug);
}
