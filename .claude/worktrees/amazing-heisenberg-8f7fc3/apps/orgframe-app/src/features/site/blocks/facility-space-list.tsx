import { Alert } from "@orgframe/ui/primitives/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { asBody, asNumber, asObject, asText } from "@/src/features/site/blocks/helpers";
import type {
  BlockContext,
  BlockEditorProps,
  BlockRenderProps,
  FacilitySpaceListBlockConfig
} from "@/src/features/site/types";
import { FacilitySpaceListRepeater } from "@/src/features/site/blocks/facility-space-list-repeater";

function defaultFacilitySpaceListConfig(_: BlockContext): FacilitySpaceListBlockConfig {
  return {
    title: "Facility Space Status",
    body: "Display space-level status so families and participants can see what is open or booked.",
    maxItems: 24,
    showOnlyBookable: false,
    showHierarchy: true,
    emptyMessage: "No spaces are available right now."
  };
}

export function createDefaultFacilitySpaceListConfig(context: BlockContext) {
  return defaultFacilitySpaceListConfig(context);
}

export function sanitizeFacilitySpaceListConfig(config: unknown, context: BlockContext): FacilitySpaceListBlockConfig {
  const fallback = defaultFacilitySpaceListConfig(context);
  const value = asObject(config);

  return {
    title: asText(value.title, fallback.title, 120),
    body: asBody(value.body, fallback.body, 500),
    maxItems: asNumber(value.maxItems, fallback.maxItems, 1, 200),
    showOnlyBookable: typeof value.showOnlyBookable === "boolean" ? value.showOnlyBookable : fallback.showOnlyBookable,
    showHierarchy: typeof value.showHierarchy === "boolean" ? value.showHierarchy : fallback.showHierarchy,
    emptyMessage: asBody(value.emptyMessage, fallback.emptyMessage, 160)
  };
}

function resolveDepth(
  space: {
    id: string;
    parentSpaceId: string | null;
  },
  byId: Map<string, { id: string; parentSpaceId: string | null }>
) {
  let depth = 0;
  let cursor = space.parentSpaceId;
  let guard = 0;
  while (cursor && guard < 100) {
    const next = byId.get(cursor);
    if (!next) {
      break;
    }
    depth += 1;
    cursor = next.parentSpaceId;
    guard += 1;
  }

  return depth;
}

function formatNextAvailable(value: string | null, timezone: string) {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(parsed);
}

export function FacilitySpaceListBlockRender({ block, runtimeData }: BlockRenderProps<"facility_space_list">) {
  const snapshot = runtimeData.facilityAvailability;

  if (!snapshot) {
    return (
      <section id="facility-space-list">
        <Alert variant="info">{block.config.emptyMessage}</Alert>
      </section>
    );
  }

  const byId = new Map(snapshot.spaces.map((space) => [space.id, space]));
  const spaces = snapshot.spaces
    .filter((space) => (block.config.showOnlyBookable ? space.isBookable : true))
    .sort((a, b) => {
      if (a.parentSpaceId !== b.parentSpaceId) {
        return (a.parentSpaceId ?? "").localeCompare(b.parentSpaceId ?? "");
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, block.config.maxItems);

  return (
    <section id="facility-space-list">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{block.config.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-text-muted md:text-base">{block.config.body}</p>
          {spaces.length === 0 ? <Alert variant="info">{block.config.emptyMessage}</Alert> : null}
          <FacilitySpaceListRepeater
            items={spaces.map((space) => ({
              currentStatus: space.currentStatus,
              id: space.id,
              isBookable: space.isBookable,
              name: block.config.showHierarchy ? `${"> ".repeat(resolveDepth(space, byId))}${space.name}` : space.name,
              nextAvailableLabel: formatNextAvailable(space.nextAvailableAtUtc, space.timezone),
              spaceKind: space.spaceKind
            }))}
          />
        </CardContent>
      </Card>
    </section>
  );
}

export function FacilitySpaceListBlockEditor({ block, onChange }: BlockEditorProps<"facility_space_list">) {
  function updateConfig(patch: Partial<FacilitySpaceListBlockConfig>) {
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
      <FormField label="Title">
        <Input onChange={(event) => updateConfig({ title: event.target.value })} value={block.config.title} />
      </FormField>
      <FormField label="Body">
        <Textarea className="min-h-[90px]" onChange={(event) => updateConfig({ body: event.target.value })} value={block.config.body} />
      </FormField>
      <FormField label="Max items">
        <Input
          min={1}
          onChange={(event) => updateConfig({ maxItems: asNumber(event.target.value, block.config.maxItems, 1, 200) })}
          type="number"
          value={String(block.config.maxItems)}
        />
      </FormField>
      <label className="ui-inline-toggle">
        <Checkbox
          checked={block.config.showOnlyBookable}
          onChange={(event) => updateConfig({ showOnlyBookable: event.target.checked })}
        />
        Show only bookable spaces
      </label>
      <label className="ui-inline-toggle">
        <Checkbox checked={block.config.showHierarchy} onChange={(event) => updateConfig({ showHierarchy: event.target.checked })} />
        Indent by hierarchy
      </label>
      <FormField label="Empty state message">
        <Input onChange={(event) => updateConfig({ emptyMessage: event.target.value })} value={block.config.emptyMessage} />
      </FormField>
    </div>
  );
}
