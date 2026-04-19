# OrgFrame — App Inventory

---

## 1. Public Routes

Routes visible to all visitors under an organization's subdomain or custom domain.


### Home Page

The organization's root page, rendered from the site builder's "home" page entry.

**Status:**
- 

**Ideas:**
- 


### Custom CMS Pages (/[pageSlug])

Dynamic pages created by org admins in the site builder. Supports blocks: hero, programs catalog, events, forms, team directory, facility availability, and more.

**Status:**
- 

**Ideas:**
- 


### Calendar (/calendar)

Public calendar showing published events and occurrences. Also supports individual occurrence detail pages.

**Status:**
- 

**Ideas:**
- 


### Events (/events)

Public events listing page.

**Status:**
- 

**Ideas:**
- 


### Programs (/programs)

Public program catalog. Drills down into individual programs, divisions, teams, and team calendars.

**Status:**
- 

**Ideas:**
- 


### Registration (/register/[formSlug])

Public-facing registration forms for programs and events.

**Status:**
- 

**Ideas:**
- 


### Payment Links (/pay/[linkSlug])

Public payment link checkout pages for ad hoc payments.

**Status:**
- 

**Ideas:**
- 

---

## 2. Manage Routes

Admin interface for organization staff. Requires login and appropriate permissions. Accessed via the "Manage" button in the org header.


### Manage Dashboard (/manage)

Overview landing page with cards linking to all available management modules, organized by Organization and Operations sections.

**Status:**
- 

**Ideas:**
- 


### Access (/manage/access)

Redirects to People. Legacy route for access control management.

**Status:**
- 

**Ideas:**
- 


### Billing (/manage/billing)

Legacy redirect to Payments Settings. Stripe billing and subscription management.

**Status:**
- 

**Ideas:**
- 


### Branding (/manage/branding)

Upload and manage org logo, icon, and accent color.

**Status:**
- 

**Ideas:**
- 


### Calendar (/manage/calendar)

Full-featured calendar editor for org admins. Manage events, practices, games, facility bookings, and team invites.

**Status:**
- 

**Ideas:**
- 


### Data (/manage/data)

Organization dashboards, data overview, import run history, and AI-assisted import tools (formerly the Workspace hub).

**Status:**
- 

**Ideas:**
- 


### Domains (/manage/domains)

Connect and verify custom domains. Supports Domain Connect protocol and manual DNS setup.

**Status:**
- 

**Ideas:**
- 


### Events (/manage/events)

Create and manage standalone events outside of programs.

**Status:**
- 

**Ideas:**
- 


### Facilities (/manage/facilities)

Manage physical spaces. Sub-routes per facility: overview, structure, schedule rules, settings, and exceptions.

**Status:**
- 

**Ideas:**
- 


### Forms (/manage/forms)

Build and manage registration forms and general forms. Sub-routes per form: editor, submissions, settings.

**Status:**
- 

**Ideas:**
- 


### Imports (/manage/imports)

Smart Import tool. Upload CSV/XLSX files for people, programs, and commerce data. AI-assisted conflict resolution and staged apply logs.

**Status:**
- 

**Ideas:**
- 


### Inbox (/manage/inbox)

Unified communications inbox. Manage conversations across channels. Sub-route for connection settings.

**Status:**
- 

**Ideas:**
- 


### Org Info (/manage/info)

View and edit core organization metadata: name, governing body, identifiers.

**Status:**
- 

**Ideas:**
- 


### Payments (/manage/payments)

Review payment transactions. Sub-routes: payment links management, Stripe Connect settings.

**Status:**
- 

**Ideas:**
- 


### People (/manage/people)

Member and staff directory. Manage accounts, linked profiles, and relationship access. Sub-route for groups.

**Status:**
- 

**Ideas:**
- 


### Programs (/manage/programs)

Full program management. Per-program sub-routes: settings, structure (divisions/teams), schedule, registration form, team management.

**Status:**
- 

**Ideas:**
- 


### Site (/manage/site)

Public website settings: page management, navigation structure, published/draft states.

**Status:**
- 

**Ideas:**
- 


### SportsConnect (/manage/sportsconnect)

SportsEngine/SportsConnect integration. Redirects to Smart Import.

**Status:**
- 

**Ideas:**
- 

---

## 3. Platform Routes

Routes that live outside of any organization context.


### Auth (/auth)

Login, password reset, and OAuth callback handling.

**Status:**
- 

**Ideas:**
- 


### Account (/account)

Logged-in user's personal account: profile, organizations list, linked player profiles.

**Status:**
- 

**Ideas:**
- 


### API (/api)

Backend API routes. Covers: account endpoints, AI assistant, file manager, integrations (Facebook, Google Sheets, SportsEngine), webhooks (Stripe, Facebook), inbox email handling, file uploads, slug checking, domain connect protocol.

**Status:**
- 

**Ideas:**
- 


### Forbidden (/forbidden)

Access denied page shown when a user lacks permissions for a route.

**Status:**
- 

**Ideas:**
- 

---

## 4. Feature Modules (src/features/)

Internal feature modules that power the routes above.


### access

UI components and logic for managing member access, roles, and permissions within an org.

**Status:**
- 

**Ideas:**
- 


### ai

AI assistant integration: conversation UI, tool registry, plan/execute workflow, context resolution, Claude API gateway.

**Status:**
- 

**Ideas:**
- 


### billing

Stripe billing service layer: subscription management, types, and payment processing utilities.

**Status:**
- 

**Ideas:**
- 


### calendar

Calendar read model, recurring event engine, occurrence scoping, notifications, and calendar UI components.

**Status:**
- 

**Ideas:**
- 


### canvas

Grid-based visual canvas system used for program structure layouts (divisions, teams).

**Status:**
- 

**Ideas:**
- 


### communications

Unified inbox: email integrations, Facebook Messenger, message threading, contact identity resolution.

**Status:**
- 

**Ideas:**
- 


### core

Core infrastructure: auth session, account management, layout components (OrgHeader, sidebar, app shell), navigation config, tool availability config, editor framework.

**Status:**
- 

**Ideas:**
- 


### facilities

Facility and space management: scheduling rules engine, availability snapshots, booking management, status tracking.

**Status:**
- 

**Ideas:**
- 


### files

File upload manager, browser UI, file operations, and storage integration.

**Status:**
- 

**Ideas:**
- 


### forms

Form builder, registration form management, submission handling, schema validation, and form embedding.

**Status:**
- 

**Ideas:**
- 


### imports

Smart Import: SportsEngine and Google Sheets integrations, staged import pipeline, AI conflict assistance, apply logs.

**Status:**
- 

**Ideas:**
- 


### orders

Order and payment order management, order panel UI.

**Status:**
- 

**Ideas:**
- 


### org-share

Universal sharing: public link generation, sharing controls, and share context provider.

**Status:**
- 

**Ideas:**
- 


### people

People directory: account management, member profiles, linked player/staff relationships, group management.

**Status:**
- 

**Ideas:**
- 


### players

Player profiles: player-specific data, associations to accounts and teams.

**Status:**
- 

**Ideas:**
- 


### programs

Program management: catalog, divisions, teams, schedules, public program views, registration linkage.

**Status:**
- 

**Ideas:**
- 


### site

Public website builder: page management, block system (hero, events, programs catalog, form embed, etc.), navigation editor, publishing workflow.

**Status:**
- 

**Ideas:**
- 


### workspace

Workspace UI shell: AI copilot rail, copilot provider, workspace hub (data/dashboard view), import workspace.

**Status:**
- 

**Ideas:**
- 

---

## 5. Shared Utilities (src/shared/)

Cross-cutting infrastructure used throughout the app.


### branding

Org asset URL generation, CSS branding variable application, logo/icon path handling.

**Status:**
- 

**Ideas:**
- 


### data-api

Supabase data API client configuration, server-side proxying, public/authenticated client factory.

**Status:**
- 

**Ideas:**
- 


### domains

Custom domain handling: Vercel domain APIs, Domain Connect protocol, subdomain resolution, domain verification utilities.

**Status:**
- 

**Ideas:**
- 


### env

Environment variable helpers and feature flag utilities (e.g. branch header visibility).

**Status:**
- 

**Ideas:**
- 


### navigation

Navigation error handling and route utilities.

**Status:**
- 

**Ideas:**
- 


### org

Organization context resolution: auth context, request context, membership access, feature flags, governing body lookup, reserved slugs.

**Status:**
- 

**Ideas:**
- 


### permissions

Permission checking, capability definitions, role-based access control helpers.

**Status:**
- 

**Ideas:**
- 


### supabase

Supabase client setup: server-side auth, service role client, cookie management, schema-aware client factory.

**Status:**
- 

**Ideas:**
- 
