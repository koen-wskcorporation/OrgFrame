import type { Metadata } from "next";
import "./globals.css";
import { AppFooter } from "@/components/shared/AppFooter";
import { PrimaryHeader } from "@/components/shared/PrimaryHeader";
import { ToastProvider } from "@/components/ui/toast";
import { UploadProvider } from "@/modules/uploads";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: {
    default: "Sports SaaS",
    template: "%s | Sports SaaS"
  },
  description: "Multi-tenant sports operations suite"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
<<<<<<< HEAD
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF;
  const showChrome = process.env.NODE_ENV !== "production" || gitBranch === "testing";

=======
>>>>>>> 48a50b4d5983e8e931ae7a2e751bc3703734f32b
  return (
    <html lang="en">
      <body className="bg-canvas text-text antialiased">
        <ToastProvider>
          <UploadProvider>
            <div className="app-frame">
              <div className="app-root flex min-h-screen min-w-0 flex-col">
<<<<<<< HEAD
                {showChrome ? <PrimaryHeader /> : null}
                <div className={showChrome ? "flex-1 min-w-0 pt-3 md:pt-4" : "flex-1 min-w-0"}>{children}</div>
                {showChrome ? <AppFooter /> : null}
=======
                <PrimaryHeader />
                <div className="flex-1 min-w-0 pt-3 md:pt-4">{children}</div>
                <AppFooter />
>>>>>>> 48a50b4d5983e8e931ae7a2e751bc3703734f32b
              </div>
              <div className="panel-dock" id="panel-dock" />
            </div>
          </UploadProvider>
        </ToastProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
