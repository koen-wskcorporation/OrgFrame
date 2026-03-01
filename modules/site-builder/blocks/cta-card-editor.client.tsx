"use client";

import { AssetTile } from "@/components/ui/asset-tile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ButtonListEditor } from "@/components/editor/buttons/ButtonListEditor";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getOrgSiteAssetPublicUrl } from "@/modules/site-builder/storage";
import type { BlockEditorProps, CtaCardBlockConfig } from "@/modules/site-builder/types";

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
      <FormField label="Heading">
        <Input
          onChange={(event) => {
            updateConfig({ heading: event.target.value });
          }}
          value={block.config.heading}
        />
      </FormField>
      <FormField label="Body">
        <Textarea
          className="min-h-[110px]"
          onChange={(event) => {
            updateConfig({ body: event.target.value });
          }}
          value={block.config.body}
        />
      </FormField>

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
            Reset crop
          </Button>
        </div>
      </div>
    </div>
  );
}
