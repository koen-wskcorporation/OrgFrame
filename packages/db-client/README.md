# @orgframe/db-client

Generic, app-agnostic primitives for server-action middleware:

- `defineOrgAction` — wraps a handler with auth resolution, permission check,
  rate limit, Zod input validation, structured `{ ok, code }` error
  normalization, and audit logging.
- `ActionError` / `ActionResult<T>` / `ok` / `fail` — standard result shape.
- Pluggable `AuditWriter` and `RateLimiter` interfaces with sensible defaults.

The package itself is dependency-injected — apps wire their `getOrgAuthContext`,
`Permission` union, and `rethrowIfNavigationError` into a single factory call,
then export a typed `defineOrgAction` for feature code.

## Wiring (per app)

```ts
// apps/orgframe-app/src/shared/actions/index.ts
import "server-only";
import { createActionFactory } from "@orgframe/db-client";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import type { Permission } from "@/src/features/core/access";

export const { defineOrgAction } = createActionFactory<
  Awaited<ReturnType<typeof getOrgAuthContext>>,
  Permission
>({
  resolveAuthContext: getOrgAuthContext,
  getPermissions: (auth) => auth.membershipPermissions,
  getOrgId: (auth) => auth.orgId,
  getUserId: (auth) => auth.userId,
  rethrowNavigation: rethrowIfNavigationError
});
```

## Using in a feature

```ts
"use server";
import { z } from "zod";
import { defineOrgAction } from "@/src/shared/actions";
import { createCalendarEntryRecord } from "@/src/features/calendar/db/queries";

const input = z.object({ title: z.string().min(1), startsAt: z.string() });

export const createCalendarEntry = defineOrgAction(
  { name: "calendar.createEntry", permission: "calendar.write", input, audit: true },
  async ({ auth }, data) => {
    return await createCalendarEntryRecord(auth.orgId, data);
  }
);
```

The handler returns `{ ok: true, data } | { ok: false, code, error }`.
Throw `ActionError("not_found", "...")` to short-circuit with a typed error.
