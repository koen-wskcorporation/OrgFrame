import { Alert } from "@orgframe/ui/primitives/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { InlineText } from "@orgframe/ui/primitives/inline-text";
import { Input } from "@orgframe/ui/primitives/input";
import { asBody, asNumber, asObject, asText } from "@/src/features/site/blocks/helpers";
import type { BlockContext, BlockEditorProps, BlockRenderProps, TeamsDirectoryBlockConfig } from "@/src/features/site/types";
import { TeamsDirectoryRepeater } from "@/src/features/site/blocks/teams-directory-repeater";

function defaultTeamsDirectoryConfig(_: BlockContext): TeamsDirectoryBlockConfig {
  return {
    title: "Teams Directory",
    body: "Browse active teams across published programs.",
    maxItems: 24,
    showProgram: true,
    showDivision: true,
    showCounts: true,
    emptyMessage: "No teams are available right now."
  };
}

export function createDefaultTeamsDirectoryConfig(context: BlockContext) {
  return defaultTeamsDirectoryConfig(context);
}

export function sanitizeTeamsDirectoryConfig(config: unknown, context: BlockContext): TeamsDirectoryBlockConfig {
  const fallback = defaultTeamsDirectoryConfig(context);
  const value = asObject(config);

  return {
    title: asText(value.title, fallback.title, 120),
    body: asBody(value.body, fallback.body, 500),
    maxItems: asNumber(value.maxItems, fallback.maxItems, 1, 200),
    showProgram: typeof value.showProgram === "boolean" ? value.showProgram : fallback.showProgram,
    showDivision: typeof value.showDivision === "boolean" ? value.showDivision : fallback.showDivision,
    showCounts: typeof value.showCounts === "boolean" ? value.showCounts : fallback.showCounts,
    emptyMessage: asBody(value.emptyMessage, fallback.emptyMessage, 180)
  };
}

function teamHref(orgSlug: string, item: { programSlug: string; divisionSlug: string | null; teamSlug: string }) {
  if (item.divisionSlug) {
    return `/${orgSlug}/programs/${item.programSlug}/${item.divisionSlug}/${item.teamSlug}`;
  }

  return `/${orgSlug}/programs/${item.programSlug}`;
}

export function TeamsDirectoryBlockRender({ block, context, runtimeData, isEditing, onChange }: BlockRenderProps<"teams_directory">) {
  const teams = (runtimeData.teamsDirectoryItems ?? []).slice(0, block.config.maxItems);
  const canInlineEdit = isEditing && Boolean(onChange);

  return (
    <section id="teams-directory">
      <Card>
        <CardHeader>
          {canInlineEdit ? (
            <InlineText
              as="h3"
              className="text-2xl font-semibold leading-tight tracking-tight text-text"
              maxLength={120}
              onCommit={(next) => onChange?.({ ...block, config: { ...block.config, title: next } })}
              placeholder="Title"
              value={block.config.title}
            />
          ) : (
            <CardTitle className="text-2xl">{block.config.title}</CardTitle>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {canInlineEdit ? (
            <InlineText
              multiline
              className="text-sm text-text-muted md:text-base"
              maxLength={500}
              onCommit={(next) => onChange?.({ ...block, config: { ...block.config, body: next } })}
              placeholder="Body"
              value={block.config.body}
            />
          ) : (
            <p className="text-sm text-text-muted md:text-base">{block.config.body}</p>
          )}

          {teams.length === 0 ? (
            <Alert variant="info">{block.config.emptyMessage}</Alert>
          ) : (
            <TeamsDirectoryRepeater
              items={teams.map((item) => ({
                ageGroup: item.ageGroup,
                divisionName: item.divisionName,
                gender: item.gender,
                href: teamHref(context.orgSlug, item),
                levelLabel: item.levelLabel,
                memberCount: item.memberCount,
                programName: item.programName,
                showCounts: block.config.showCounts,
                showDivision: block.config.showDivision,
                showProgram: block.config.showProgram,
                staffCount: item.staffCount,
                teamId: item.teamId,
                teamName: item.teamName
              }))}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function TeamsDirectoryBlockEditor({ block, onChange }: BlockEditorProps<"teams_directory">) {
  function updateConfig(patch: Partial<TeamsDirectoryBlockConfig>) {
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
      <FormField label="Max items">
        <Input
          min={1}
          onChange={(event) => updateConfig({ maxItems: asNumber(event.target.value, block.config.maxItems, 1, 200) })}
          type="number"
          value={String(block.config.maxItems)}
        />
      </FormField>
      <label className="ui-inline-toggle">
        <Checkbox checked={block.config.showProgram} onChange={(event) => updateConfig({ showProgram: event.target.checked })} />
        Show program names
      </label>
      <label className="ui-inline-toggle">
        <Checkbox checked={block.config.showDivision} onChange={(event) => updateConfig({ showDivision: event.target.checked })} />
        Show divisions
      </label>
      <label className="ui-inline-toggle">
        <Checkbox checked={block.config.showCounts} onChange={(event) => updateConfig({ showCounts: event.target.checked })} />
        Show roster and staff counts
      </label>
      <FormField label="Empty state message">
        <Input onChange={(event) => updateConfig({ emptyMessage: event.target.value })} value={block.config.emptyMessage} />
      </FormField>
    </div>
  );
}
