"use client";

import { useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { AccountEditPopup } from "@/src/features/core/account/components/AccountEditPopup";

type AccountProfileCardProps = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  allowEdit?: boolean;
  title?: string;
  description?: string;
  className?: string;
};

export function AccountProfileCard({
  email,
  firstName,
  lastName,
  avatarPath,
  avatarUrl,
  allowEdit = true,
  title = "Profile",
  description = "Your identity details shown across organizations.",
  className
}: AccountProfileCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "No name set";

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-control border bg-surface-muted p-3">
            {avatarUrl ? (
              <img alt={`${fullName} avatar`} className="h-12 w-12 rounded-full border object-cover" src={avatarUrl} />
            ) : (
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border bg-surface text-sm font-semibold">
                {(fullName.charAt(0) || "A").toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-sm font-semibold">{fullName}</p>
              <p className="text-xs text-text-muted">{email ?? "No email available"}</p>
            </div>
          </div>

          {allowEdit ? (
            <div>
              <Button onClick={() => setEditOpen(true)} type="button" variant="secondary">
                Edit account details
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {allowEdit ? (
        <AccountEditPopup
          email={email}
          initialAvatarPath={avatarPath}
          initialAvatarUrl={avatarUrl}
          initialFirstName={firstName}
          initialLastName={lastName}
          onClose={() => setEditOpen(false)}
          open={editOpen}
        />
      ) : null}
    </>
  );
}
