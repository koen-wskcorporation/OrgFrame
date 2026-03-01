import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthDialogTrigger } from "@/components/auth/AuthDialogTrigger";

export const metadata: Metadata = {
  title: "Access Forbidden"
};

export default function ForbiddenPage() {
  return (
    <main className="app-container flex min-h-[60vh] items-center py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Access Forbidden</CardTitle>
          <CardDescription>You do not have permission to access this page or action.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/">
            <Button>Back to Dashboard</Button>
          </Link>
          <AuthDialogTrigger label="Sign in as Different Account" size="md" variant="ghost" />
        </CardContent>
      </Card>
    </main>
  );
}
