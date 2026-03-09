"use client";

import { useState } from "react";
import { AssetTile } from "@/components/ui/asset-tile";
import { ColorPickerInput } from "@/components/ui/color-picker-input";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { UploadedAsset } from "@/modules/uploads/types";

type BrandingFormProps = {
  orgSlug: string;
  orgName: string;
  canManageBranding: boolean;
  logoPath: string | null;
  logoUrl: string | null;
  iconPath: string | null;
  iconUrl: string | null;
  accent: string | null;
  saveAction: (formData: FormData) => void | Promise<void>;
};

export function BrandingForm({
  orgSlug,
  orgName,
  canManageBranding,
  logoPath,
  logoUrl,
  iconPath,
  iconUrl,
  accent,
  saveAction
}: BrandingFormProps) {
  const [accentValue, setAccentValue] = useState(accent ?? "");
  const [suggestedAccent, setSuggestedAccent] = useState<string | null>(null);

  function handleLogoChange(asset: UploadedAsset) {
    if (!asset.dominantColor) {
      return;
    }

    setSuggestedAccent(asset.dominantColor);
    setAccentValue(asset.dominantColor);
  }

  return (
    <form action={saveAction} className="space-y-5">
      <fieldset className="space-y-4" disabled={!canManageBranding}>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField className="space-y-2" label="Org Logo">
            <AssetTile
              constraints={{
                accept: "image/*,.svg",
                maxSizeMB: 10,
                aspect: "free",
                recommendedPx: {
                  w: 1200,
                  h: 500
                }
              }}
              disabled={!canManageBranding}
              emptyLabel="Upload logo"
              fit="contain"
              initialPath={logoPath}
              initialUrl={logoUrl}
              kind="org"
              name="logoPath"
              onChange={handleLogoChange}
              orgSlug={orgSlug}
              previewAlt={`${orgName} logo`}
              purpose="org-logo"
              specificationText="PNG, JPG, WEBP, HEIC, or SVG"
              title="Org Logo"
            />
          </FormField>

          <FormField className="space-y-2" label="Org Icon">
            <AssetTile
              constraints={{
                accept: "image/*,.ico",
                maxSizeMB: 10,
                aspect: "square",
                recommendedPx: {
                  w: 512,
                  h: 512
                }
              }}
              disabled={!canManageBranding}
              emptyLabel="Upload icon"
              fit="contain"
              initialPath={iconPath}
              initialUrl={iconUrl}
              kind="org"
              name="iconPath"
              orgSlug={orgSlug}
              previewAlt={`${orgName} icon`}
              purpose="org-icon"
              specificationText="PNG, ICO, JPG, HEIC, or SVG"
              title="Org Icon"
            />
          </FormField>
        </div>

        <FormField hint="Hex format: #RRGGBB" label="Accent Color">
          <div className="space-y-2">
            <ColorPickerInput disabled={!canManageBranding} name="accent" onChange={setAccentValue} value={accentValue} />
            {suggestedAccent ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-text-muted">Logo color: {suggestedAccent}</p>
                <Button
                  onClick={() => setAccentValue(suggestedAccent)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Use logo color
                </Button>
              </div>
            ) : null}
          </div>
        </FormField>
      </fieldset>

      {!canManageBranding ? <Alert variant="warning">You have read-only access to branding settings.</Alert> : null}
      <SubmitButton disabled={!canManageBranding}>Save Branding</SubmitButton>
    </form>
  );
}
