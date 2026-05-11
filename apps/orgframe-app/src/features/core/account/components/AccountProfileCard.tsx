"use client";

import { useRouter } from "next/navigation";
import { Avatar } from "@orgframe/ui/primitives/avatar";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { EditableAvatar } from "@/src/features/core/account/components/EditableAvatar";
import { saveProfilePhoto } from "@/src/features/core/account/components/saveProfilePhoto";

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
  avatarUrl,
  allowEdit = true,
  title = "Account",
  description = "Your identity details shown across organizations.",
  className
}: AccountProfileCardProps) {
  const router = useRouter();
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "No name set";

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 rounded-control border bg-surface-muted p-3">
          {allowEdit ? (
            <EditableAvatar
              name={fullName}
              onSelect={async (result) => {
                await saveProfilePhoto(result);
                router.refresh();
              }}
              sizePx={48}
              src={avatarUrl}
            />
          ) : (
            <Avatar alt={`${fullName} avatar`} name={fullName} sizePx={48} src={avatarUrl} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{fullName}</p>
            <p className="text-xs text-text-muted">{email ?? "No email available"}</p>
          </div>
          {allowEdit ? (
            <Button className="ml-auto" href="/profiles" type="button" variant="secondary">
              Manage people
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
