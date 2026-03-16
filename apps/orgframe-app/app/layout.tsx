import type { Metadata } from "next";
import "./globals.css";
import { AppFooter } from "@orgframe/ui/shared/AppFooter";
import { PrimaryHeader } from "@orgframe/ui/shared/PrimaryHeader";
import { ConfirmDialogProvider } from "@orgframe/ui/ui/confirm-dialog";
import { ThemeModeProvider } from "@orgframe/ui/ui/theme-mode";
import { ToastProvider } from "@orgframe/ui/ui/toast";
import { shouldShowBranchHeaders } from "@/lib/env/branchVisibility";
import { UploadProvider } from "@/modules/uploads";
import { OrderPanelProvider } from "@/modules/orders";
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
  const showHeaders = shouldShowBranchHeaders();
  return (
    <html lang="en">
      <body className="bg-canvas text-text antialiased">
        <ThemeModeProvider>
          <ToastProvider>
            <ConfirmDialogProvider>
              <OrderPanelProvider>
                <UploadProvider>
                  <div className="app-frame">
                    <div className="app-root flex min-h-screen min-w-0 flex-col">
                      {showHeaders ? <PrimaryHeader /> : null}
                      <div className={showHeaders ? "flex-1 min-w-0 pt-[var(--layout-gap)]" : "flex-1 min-w-0"}>{children}</div>
                    </div>
                    <div className="panel-dock" id="panel-dock" />
                  </div>
                </UploadProvider>
              </OrderPanelProvider>
            </ConfirmDialogProvider>
          </ToastProvider>
        </ThemeModeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
