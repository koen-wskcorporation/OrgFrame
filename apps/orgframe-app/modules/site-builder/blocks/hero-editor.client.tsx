"use client";

import { AssetTile } from "@orgframe/ui/ui/asset-tile";
import { Button } from "@orgframe/ui/ui/button";
import { RichTextEditor } from "@orgframe/ui/editor/RichTextEditor";
import { ButtonListEditor } from "@orgframe/ui/editor/buttons/ButtonListEditor";
import { FormField } from "@orgframe/ui/ui/form-field";
import { Input } from "@orgframe/ui/ui/input";
import { getOrgSiteAssetPublicUrl } from "@/modules/site-builder/storage";
import type { BlockEditorProps, HeroBlockConfig } from "@/modules/site-builder/types";

export function HeroBlockEditorClient({ block, context, onChange }: BlockEditorProps<"hero">) {
  const imageUrl = getOrgSiteAssetPublicUrl(block.config.backgroundImagePath);

  function updateConfig(patch: Partial<HeroBlockConfig>) {
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
      <FormField label="Headline">
        <Input
          onChange={(event) => {
            updateConfig({ headline: event.target.value });
          }}
          value={block.config.headline}
        />
      </FormField>

      <FormField label="Subheadline">
        <RichTextEditor
          minHeight={120}
          onChange={(next) => {
            updateConfig({ subheadline: next });
          }}
          value={block.config.subheadline}
        />
      </FormField>

      <ButtonListEditor
        addButtonLabel="Add button"
        emptyStateText="No buttons yet."
        maxButtons={3}
        onChange={(buttons) => updateConfig({ buttons })}
        orgSlug={context.orgSlug}
        value={block.config.buttons}
      />

      <div className="space-y-3">
        <FormField label="Hero Background">
          <AssetTile
            constraints={{
              accept: "image/*",
              maxSizeMB: 10,
              aspect: "wide",
              recommendedPx: {
                w: 1920,
                h: 1080
              }
            }}
            emptyLabel="Upload hero image"
            fit="cover"
            initialCrop={{
              focalX: block.config.focalX,
              focalY: block.config.focalY,
              zoom: block.config.zoom
            }}
            initialPath={block.config.backgroundImagePath}
            initialUrl={imageUrl}
            kind="org"
            onChange={(uploadedAsset) => {
              updateConfig({
                backgroundImagePath: uploadedAsset.path,
                focalX: uploadedAsset.crop?.focalX ?? block.config.focalX,
                focalY: uploadedAsset.crop?.focalY ?? block.config.focalY,
                zoom: uploadedAsset.crop?.zoom ?? block.config.zoom
              });
            }}
            onRemove={() => {
              updateConfig({ backgroundImagePath: null });
            }}
            orgSlug={context.orgSlug}
            previewAlt="Hero preview"
            purpose="site-hero"
            specificationText="PNG, JPG, WEBP, HEIC, or SVG"
            title="Hero background image"
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
            Reset crop
          </Button>
        </div>
      </div>

      <p className="text-xs text-text-muted">Editing page: {context.pageSlug}</p>
    </div>
  );
}
