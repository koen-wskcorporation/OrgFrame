import {
  Users,
  Layers,
  Calendar,
  FileText,
  CreditCard,
  MapPin,
  Ticket,
  MessageSquare,
  LayoutTemplate,
  Database,
  Globe,
  Sparkles,
  type LucideIcon
} from "lucide-react";

export type ModuleSlug =
  | "people"
  | "programs"
  | "calendar"
  | "forms"
  | "payments"
  | "facilities"
  | "events"
  | "communications"
  | "site"
  | "imports"
  | "domains"
  | "workspace";

export interface ModuleCapability {
  title: string;
  body: string;
}

export interface ModuleFaq {
  q: string;
  a: string;
}

export interface ModuleDef {
  slug: ModuleSlug;
  name: string;
  tagline: string;
  summary: string;
  lede: string;
  icon: LucideIcon;
  capabilities: ModuleCapability[];
  faq: ModuleFaq[];
  related: ModuleSlug[];
}

export const MODULES: ReadonlyArray<ModuleDef> = [
  {
    slug: "people",
    name: "People",
    tagline: "Everyone, in one roster.",
    summary: "Members, staff, and families — one living directory with the access each role actually needs.",
    lede: "Replace the spreadsheets and stale exports. Every person in your organization lives in a single roster with profiles, relationships, and role-based access that matches how your org actually works.",
    icon: Users,
    capabilities: [
      { title: "Unified profiles", body: "One record per person, with family links, medical flags, waivers, and history — no duplicate entries between registration and season rosters." },
      { title: "Role-based access", body: "Coaches see their teams. Admins see everything. Parents see their kids. Permissions follow the person as they change roles." },
      { title: "Search that thinks", body: "Find anyone by name, team, division, role, age group, or tag in milliseconds. No more digging through CSVs." }
    ],
    faq: [
      { q: "Does it replace our registration system?", a: "It works with it. People are created automatically when they register, and profiles stay in sync." },
      { q: "Can parents edit their own info?", a: "Yes. Self-service profile editing is on by default, with admin-controlled fields for anything sensitive." }
    ],
    related: ["programs", "communications", "forms"]
  },
  {
    slug: "programs",
    name: "Programs",
    tagline: "Seasons, divisions, teams — without the chaos.",
    summary: "Model any structure: travel teams, rec leagues, clinics, camps, academies. Reorganize in a click.",
    lede: "Sports orgs are multi-layered. Programs models that directly — seasons, divisions, age groups, teams, coaches, rosters — and lets you restructure without starting over.",
    icon: Layers,
    capabilities: [
      { title: "Nested hierarchy", body: "Programs contain divisions contain teams. Changes cascade when they should, stay scoped when they shouldn't." },
      { title: "Team assignments", body: "Drag-and-drop player placements with eligibility rules, waitlists, and carry-over logic from season to season." },
      { title: "Coach tools", body: "Per-team dashboards for coaches with their roster, schedule, and communications — nothing else to distract." }
    ],
    faq: [
      { q: "Can we run multiple sports?", a: "Yes. A single organization can operate multiple sports, seasons, and program types in parallel." },
      { q: "What about travel teams vs rec?", a: "Both models are first-class. Tryouts, evaluations, and tiered placements for travel; open registration and balanced drafts for rec." }
    ],
    related: ["people", "calendar", "forms"]
  },
  {
    slug: "calendar",
    name: "Calendar",
    tagline: "Games, practices, and facility time — one view.",
    summary: "Scheduling that understands teams, locations, and conflicts — not just dates.",
    lede: "Every event your organization runs lives in one calendar, with per-team, per-facility, and per-person views that filter themselves automatically.",
    icon: Calendar,
    capabilities: [
      { title: "Conflict detection", body: "Double-booked fields, overlapping practices, or coaches on two teams — flagged before you publish." },
      { title: "Recurring schedules", body: "Build a season's worth of practices in one pass. Shift them all when the rink closes for a week." },
      { title: "Public calendars", body: "Clean team pages parents can subscribe to in Apple Calendar, Google Calendar, or Outlook." }
    ],
    faq: [
      { q: "Does it sync with our league schedule?", a: "Yes — via import or a supported league API. Changes flow one-way into OrgFrame so you control the source of truth." },
      { q: "Can coaches RSVP?", a: "Players and coaches can mark attendance and availability, with thresholds that alert admins." }
    ],
    related: ["facilities", "programs", "events"]
  },
  {
    slug: "forms",
    name: "Forms",
    tagline: "Registrations that don't drop off.",
    summary: "Build forms for registration, evaluations, surveys, waivers — with logic, payments, and approvals.",
    lede: "Registrations are where parents give up. Forms are designed to not let that happen: branching logic, saved progress, auto-linked profiles, and a Stripe checkout that feels like the ones they're used to.",
    icon: FileText,
    capabilities: [
      { title: "Conditional logic", body: "Show the right questions to the right person based on age, program, role, or any previous answer." },
      { title: "Payments built in", body: "Collect fees, deposits, or pay-in-full at submission. Support for installments and family discounts." },
      { title: "Approval flows", body: "Route submissions to coaches, admins, or medical staff when review is required — with audit history." }
    ],
    faq: [
      { q: "Can we offer discounts?", a: "Yes — codes, sibling discounts, need-based scholarships, and tiered pricing by division are all supported." },
      { q: "What happens after someone registers?", a: "A profile is created or matched, team placement rules run, and the family gets a welcome confirmation automatically." }
    ],
    related: ["payments", "people", "programs"]
  },
  {
    slug: "payments",
    name: "Payments",
    tagline: "Stripe-powered, organization-ready.",
    summary: "Take payments, run payouts, and manage billing without a finance stack taped on the side.",
    lede: "Built on Stripe Connect. Every dollar you collect flows through your own connected account, with the reporting, refunds, and reconciliation your treasurer actually asks for.",
    icon: CreditCard,
    capabilities: [
      { title: "Payment links & checkout", body: "Send a link, embed a form, or charge inside a registration. Cards, Apple Pay, and ACH where supported." },
      { title: "Subscriptions & installments", body: "Monthly training fees, season payment plans, recurring dues — with dunning and retry logic handled." },
      { title: "Clear reporting", body: "Revenue by program, by fee type, by family. Export for QuickBooks without the month-end scramble." }
    ],
    faq: [
      { q: "Who owns the Stripe account?", a: "You do. OrgFrame provisions a Connect account in your organization's name; we never hold your funds." },
      { q: "Refunds?", a: "One-click partial or full refunds with an audit trail. Family balances update immediately." }
    ],
    related: ["forms", "programs", "workspace"]
  },
  {
    slug: "facilities",
    name: "Facilities",
    tagline: "Fields, rinks, courts — tracked like assets.",
    summary: "Know what you have, what's booked, and what's available — down to the half-field or time block.",
    lede: "Your facilities are inventory. Facilities lets you model them as such: spaces, sub-spaces, availability windows, and bookings that know about each other.",
    icon: MapPin,
    capabilities: [
      { title: "Spatial modeling", body: "A field splits into halves. A rink has locker rooms. A complex has six courts. Book any of them, see the rest update." },
      { title: "Availability rules", body: "Closed for maintenance, booked by an outside group, reserved for games — layered rules that compose cleanly." },
      { title: "External bookings", body: "Rent time to outside teams with a payment link and automatic hold on the space." }
    ],
    faq: [
      { q: "Google Maps integration?", a: "Yes — address autocomplete, driving directions, and embedded maps on public team pages." },
      { q: "Can we block community use?", a: "Granular: block a space, a sub-space, a time window, or a whole day, with a reason that shows up in reports." }
    ],
    related: ["calendar", "events", "payments"]
  },
  {
    slug: "events",
    name: "Events",
    tagline: "Tournaments, clinics, tryouts — ready in minutes.",
    summary: "Public-facing events with registration, pricing, and schedules — not just a calendar item.",
    lede: "When you run a tournament, you need a real page: brackets, schedules, registered teams, payment status, and a way for visiting families to know where to go.",
    icon: Ticket,
    capabilities: [
      { title: "Public event pages", body: "A shareable URL per event with everything a visiting family needs — directions, schedule, contact, and registration." },
      { title: "Capacity & waitlists", body: "Cap teams, age groups, or slots; waitlists promote automatically when someone drops." },
      { title: "Post-event reporting", body: "Revenue, attendance, refunds, and no-shows in one place, ready to share with your board." }
    ],
    faq: [
      { q: "Can we run multi-day tournaments?", a: "Yes. Multi-day, multi-venue, with per-division brackets and per-team schedules." },
      { q: "Custom branding?", a: "Event pages inherit your org's brand, with per-event overrides for tournament sponsors." }
    ],
    related: ["calendar", "facilities", "payments"]
  },
  {
    slug: "communications",
    name: "Communications",
    tagline: "The right message to the right group — nothing more.",
    summary: "Targeted email and in-app messaging that uses your roster as the audience — not a separate list.",
    lede: "Send an email to every U10 parent. Or every coach in the travel program. Or every family with an unpaid balance. Your audience is already here.",
    icon: MessageSquare,
    capabilities: [
      { title: "Roster-native targeting", body: "Compose an audience from any filter you can build in People or Programs. No list exports." },
      { title: "Threaded inbox", body: "Replies come back into a shared inbox so the right staff member can respond, not whoever hit reply first." },
      { title: "Delivery insights", body: "Opens, bounces, unsubscribes tracked, with rules to keep organization-critical messages flowing." }
    ],
    faq: [
      { q: "SMS?", a: "On the roadmap. Email and in-app are available today." },
      { q: "Two-way replies?", a: "Yes. Parent replies land in the shared inbox for the sending department." }
    ],
    related: ["people", "programs", "workspace"]
  },
  {
    slug: "site",
    name: "Site Management",
    tagline: "Your public site, written in your own voice.",
    summary: "A visual site builder that ships a fast, accessible public website tied directly to your organization's data.",
    lede: "Every league needs a website. Yours is usually out of date. Site Management pairs a visual page builder with live connections to your schedule, registrations, and events so the public page reflects what's actually happening.",
    icon: LayoutTemplate,
    capabilities: [
      { title: "Visual page builder", body: "Drag blocks: hero, schedule, coaching staff, news, registration, sponsor strip. No code, no templates that look like 2011." },
      { title: "Live data blocks", body: "Drop in the schedule for Tryouts and it updates when the schedule updates. No double entry, ever." },
      { title: "Custom domain & SSL", body: "Point your domain, we handle certificates. Works with Domains for verified ownership." }
    ],
    faq: [
      { q: "Can we use our own designer?", a: "Yes — ship a custom theme or hand-design pages. Or start from our defaults and edit." },
      { q: "Multiple sites per org?", a: "Supported: a main org site plus per-program or per-event microsites." }
    ],
    related: ["domains", "events", "communications"]
  },
  {
    slug: "imports",
    name: "Imports",
    tagline: "Bring everything with you — with AI doing the heavy lifting.",
    summary: "Migrate from SportsConnect, LeagueApps, TeamSnap, or a pile of spreadsheets — with an AI-assisted importer.",
    lede: "Moving platforms is usually the reason orgs don't move platforms. Imports changes that: connect your existing system or upload files, and an AI assistant maps, cleans, and proposes the structure before anything is committed.",
    icon: Database,
    capabilities: [
      { title: "AI column mapping", body: "Paste any export. The importer proposes field mappings, flags duplicates, and shows a preview before you commit." },
      { title: "Platform connectors", body: "Direct connectors for major sports platforms, with ongoing sync options for teams mid-transition." },
      { title: "Undo everything", body: "Every import is transactional. Don't like what landed? Roll it back and try again." }
    ],
    faq: [
      { q: "What about historical data?", a: "Multi-season history migrates by default, with clear audit trails for what came from where." },
      { q: "How long does a migration take?", a: "Most orgs are importable in an afternoon. Complex multi-sport orgs, a week — with our help." }
    ],
    related: ["people", "programs", "workspace"]
  },
  {
    slug: "domains",
    name: "Domains",
    tagline: "Your domain, verified and connected.",
    summary: "Bring your own domain, verify it once, and use it across site, email, and registrations.",
    lede: "Domain management is where most SaaS products get ugly. Domains keeps it clean: add your domain, verify via DNS, and OrgFrame handles the rest for every place that needs it.",
    icon: Globe,
    capabilities: [
      { title: "One verification, everywhere", body: "Verify once; your domain powers your public site, custom email sender, and branded registration links." },
      { title: "Automatic SSL", body: "Certificates provisioned and renewed automatically. No expired padlocks the morning of a tournament." },
      { title: "Subdomain management", body: "Run `register.yourclub.org` or `events.yourclub.org` without touching DNS twice." }
    ],
    faq: [
      { q: "What if we already host a site elsewhere?", a: "You can connect just the subdomain you need for OrgFrame (e.g. register.yourclub.org) and leave the rest alone." },
      { q: "Email sending?", a: "DKIM/SPF guidance provided; branded sender addresses available on Standard plans and up." }
    ],
    related: ["site", "communications", "events"]
  },
  {
    slug: "workspace",
    name: "Workspace",
    tagline: "An AI command center for your operations.",
    summary: "Ask the questions you always asked your data — and get back actions, not just answers.",
    lede: "Workspace is the layer on top of every module. Ask it who's behind on payments, which teams are short on coaches, or how this season's registrations compare to last year — and run the follow-up in one step, not twelve.",
    icon: Sparkles,
    capabilities: [
      { title: "Natural-language queries", body: "\"Which U12 families haven't paid the spring installment?\" returns a list, a message draft, and a filter you can save." },
      { title: "Agentic follow-through", body: "Chain actions: find overdue families, draft a message, schedule it for Monday morning — all reviewed before it sends." },
      { title: "Grounded in your data", body: "Every answer cites the source records, so you can verify and edit before acting. No hallucinated rosters." }
    ],
    faq: [
      { q: "What models are used?", a: "Claude and Gemini via a routing gateway, with data access scoped to your organization and your permissions." },
      { q: "Is my data trained on?", a: "No. Workspace queries are processed for inference only; we do not train on your organization's data." }
    ],
    related: ["people", "communications", "payments"]
  }
];

export function getModule(slug: string): ModuleDef | undefined {
  return MODULES.find((m) => m.slug === slug);
}
