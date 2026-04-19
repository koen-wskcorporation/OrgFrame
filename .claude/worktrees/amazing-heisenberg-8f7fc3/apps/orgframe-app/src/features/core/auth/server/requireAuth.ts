import { redirect } from "next/navigation";
import { buildRequireAuth } from "@orgframe/auth";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";

export const requireAuth = buildRequireAuth(getSessionUser, () => redirect("/auth"));
