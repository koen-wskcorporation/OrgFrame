"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <main className="app-container flex min-h-[60vh] items-center py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Page Not Found</CardTitle>
          <CardDescription>The page you requested does not exist.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
                return;
              }

              router.push("/");
            }}
            variant="secondary"
          >
            Go Back
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
