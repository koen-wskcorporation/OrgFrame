"use client";

import { AssetTile } from "@orgframe/ui/primitives/asset-tile";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { ButtonListEditor } from "@/src/features/core/editor/buttons/ButtonListEditor";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { getOrgSiteAssetPublicUrl } from "@/src/features/site/storage";
import type { BlockEditorProps, CtaCardBlockConfig } from "@/src/features/site/types";

export function CtaCardBlockEditorClient({ block, onChange, context }: BlockEditorProps<"cta_card">) {
  const imageUrl = getOrgSiteAssetPublicUrl(block.config.imagePath);

  function updateConfig(patch: Partial<CtaCardBlockConfig>) {
    onChange({
      ...block,
      config: {
        ...block.config,
        ...patch
      }
    });
  }

  return (
    <div className="space-y-4">
      <FormField label="Accent highlight">
        <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
          <Checkbox
            checked={block.config.accentHighlight}
            onChange={(event) => {
              updateConfig({ accentHighlight: event.target.checked });
            }}
          />
          Highlight this card
        </label>
      </FormField>

      <ButtonListEditor
        maxButtons={3}
        onChange={(buttons) => updateConfig({ buttons })}
        orgSlug={context.orgSlug}
        value={block.config.buttons}
      />

      <div className="space-y-3">
        <FormField label="Card image">
          <AssetTile
            constraints={{
              accept: "image/*",
              maxSizeMB: 10,
              aspect: "wide",
              recommendedPx: {
                w: 1440,
                h: 800
              }
            }}
            emptyLabel="Upload card image"
            fit="cover"
            initialCrop={{
              focalX: block.config.focalX,
              focalY: block.config.focalY,
              zoom: block.config.zoom
            }}
            initialPath={block.config.imagePath}
            initialUrl={imageUrl}
            kind="org"
            onChange={(uploadedAsset) => {
              updateConfig({
                imagePath: uploadedAsset.path,
                focalX: uploadedAsset.crop?.focalX ?? block.config.focalX,
                focalY: uploadedAsset.crop?.focalY ?? block.config.focalY,
                zoom: uploadedAsset.crop?.zoom ?? block.config.zoom
              });
            }}
            onRemove={() => {
              updateConfig({ imagePath: null });
            }}
            orgSlug={context.orgSlug}
            previewAlt="CTA card preview"
            purpose="site-block-image"
            specificationText="PNG, JPG, WEBP, HEIC, or SVG"
            title="Card image"
          />
        </FormField>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              updateConfig({
                focalX: 0.5,
                focalY: 0.5,
                zoom: 1
              });
            }}
            size="sm"
            variant="secondary"
          >
            Reset Crop
          </Button>
        </div>
      </div>
    </div>
  );
}
