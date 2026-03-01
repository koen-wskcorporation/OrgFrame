"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  AlignLeft,
  CalendarDays,
  CheckSquare,
  Copy,
  GripVertical,
  Hash,
  List,
  Mail,
  Phone,
  Plus,
  Settings2,
  Trash2,
  Type
} from "lucide-react";
import { SortableCanvas } from "@/components/editor/SortableCanvas";
import { ButtonListEditor } from "@/components/editor/buttons/ButtonListEditor";
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ComponentType, type CSSProperties } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FormBuilderNavItem } from "@/modules/forms/components/FormBuilderNavItem";
import { InlineEditableText } from "@/modules/forms/components/InlineEditableText";
import { REGISTRATION_PAGE_KEYS } from "@/modules/forms/types";
import type { FormField as FormFieldDefinition, FormFieldOption, FormFieldType, FormKind, FormPage, FormSchema } from "@/modules/forms/types";
import type { ProgramNode } from "@/modules/programs/types";

type FormFieldsVisualEditorProps = {
  orgSlug: string;
  formName: string;
  formDescription: string;
  formKind: FormKind;
  schema: FormSchema;
  programNodes: ProgramNode[];
  onChange: (nextSchema: FormSchema) => void;
  view: "editor" | "preview";
  disabled?: boolean;
};

type PaletteFieldConfig = {
  type: FormFieldType;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

type ActiveDrag =
  | {
      kind: "canvas";
      fieldId: string;
    };

const paletteFields: PaletteFieldConfig[] = [
  {
    type: "text",
    label: "Short text",
    description: "Single-line response",
    icon: Type
  },
  {
    type: "textarea",
    label: "Paragraph",
    description: "Long-form response",
    icon: AlignLeft
  },
  {
    type: "email",
    label: "Email",
    description: "Valid email address",
    icon: Mail
  },
  {
    type: "phone",
    label: "Phone number",
    description: "US phone format",
    icon: Phone
  },
  {
    type: "number",
    label: "Number",
    description: "Numeric input",
    icon: Hash
  },
  {
    type: "date",
    label: "Date",
    description: "Date picker",
    icon: CalendarDays
  },
  {
    type: "select",
    label: "Dropdown",
    description: "Pick one option",
    icon: List
  },
  {
    type: "checkbox",
    label: "Checkbox",
    description: "True/false choice",
    icon: CheckSquare
  }
];

function toFieldName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureUniqueFieldName(baseName: string, fields: FormFieldDefinition[], excludeFieldId?: string) {
  const normalizedBase = toFieldName(baseName) || "field";

  if (!fields.some((field) => field.id !== excludeFieldId && field.name === normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (fields.some((field) => field.id !== excludeFieldId && field.name === `${normalizedBase}_${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBase}_${suffix}`;
}

function getDefaultLabel(fieldType: FormFieldType) {
  switch (fieldType) {
    case "text":
      return "Short text";
    case "textarea":
      return "Paragraph";
    case "email":
      return "Email";
    case "phone":
      return "Phone number";
    case "number":
      return "Number";
    case "date":
      return "Date";
    case "select":
      return "Dropdown";
    case "checkbox":
      return "Checkbox";
    default:
      return "Field";
  }
}

function createFieldForType(fieldType: FormFieldType, allFields: FormFieldDefinition[]): FormFieldDefinition {
  const label = getDefaultLabel(fieldType);
  const fieldName = ensureUniqueFieldName(label, allFields);

  return {
    id: makeId("field"),
    name: fieldName,
    label,
    type: fieldType,
    required: false,
    placeholder: fieldType === "checkbox" ? null : fieldType === "phone" ? "(000)-000-0000" : "",
    helpText: null,
    options:
      fieldType === "select"
        ? [
            {
              value: "option_1",
              label: "Option 1"
            },
            {
              value: "option_2",
              label: "Option 2"
            }
          ]
        : [],
    targetNodeIds: [],
    includeDescendants: false
  };
}

function ensureUniqueOptionValue(baseValue: string, options: FormFieldOption[], excludeIndex?: number) {
  const normalizedBase = toFieldName(baseValue) || "option";
  const hasCollision = (value: string) => options.some((option, index) => index !== excludeIndex && option.value === value);

  if (!hasCollision(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (hasCollision(`${normalizedBase}_${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBase}_${suffix}`;
}

function transformToCss(transform: { x: number; y: number; scaleX: number; scaleY: number } | null) {
  if (!transform) {
    return undefined;
  }

  return `translate3d(${transform.x}px, ${transform.y}px, 0)`;
}

function renderPreviewField(field: FormFieldDefinition) {
  const label = field.required ? `${field.label || "Untitled field"} *` : field.label || "Untitled field";

  if (field.type === "textarea") {
    return (
      <FormField key={field.id} label={label}>
        <Textarea defaultValue="" disabled placeholder={field.placeholder ?? undefined} readOnly />
        {field.helpText ? <p className="text-xs text-text-muted">{field.helpText}</p> : null}
      </FormField>
    );
  }

  if (field.type === "select") {
    return (
      <FormField key={field.id} label={label}>
        <Select
          disabled
          options={[
            { value: "", label: "Select" },
            ...field.options.map((option) => ({
              value: option.value,
              label: option.label
            }))
          ]}
          value=""
        />
        {field.helpText ? <p className="text-xs text-text-muted">{field.helpText}</p> : null}
      </FormField>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="space-y-1" key={field.id}>
        <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
          <Checkbox disabled />
          {label}
        </label>
        {field.helpText ? <p className="text-xs text-text-muted">{field.helpText}</p> : null}
      </div>
    );
  }

  const inputType = field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";

  return (
    <FormField key={field.id} label={label}>
      <Input defaultValue="" disabled placeholder={field.placeholder ?? undefined} readOnly type={inputType} />
      {field.helpText ? <p className="text-xs text-text-muted">{field.helpText}</p> : null}
    </FormField>
  );
}

function getNodeLabel(node: ProgramNode) {
  return `${node.name} (${node.nodeKind})`;
}

function fieldMatchesNode(field: FormFieldDefinition, selectedNodeId: string | null, nodeById: Map<string, ProgramNode>) {
  if (field.targetNodeIds.length === 0) {
    return true;
  }

  if (!selectedNodeId) {
    return false;
  }

  if (field.targetNodeIds.includes(selectedNodeId)) {
    return true;
  }

  if (!field.includeDescendants) {
    return false;
  }

  let cursor: ProgramNode | undefined = nodeById.get(selectedNodeId);

  while (cursor?.parentId) {
    if (field.targetNodeIds.includes(cursor.parentId)) {
      return true;
    }
    cursor = nodeById.get(cursor.parentId);
  }

  return false;
}

function fieldTargetSummary(field: FormFieldDefinition, programNodes: ProgramNode[]) {
  if (field.targetNodeIds.length === 0) {
    return "Program-wide";
  }

  const names = field.targetNodeIds
    .map((id) => programNodes.find((node) => node.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) {
    return "Specific structure nodes";
  }

  return field.includeDescendants ? `${names.join(", ")} (+ child nodes)` : names.join(", ");
}

function PaletteItem({ config, disabled, onAdd }: { config: PaletteFieldConfig; disabled: boolean; onAdd: (fieldType: FormFieldType) => void }) {
  const Icon = config.icon;

  return (
    <div className={cn("rounded-control border bg-surface px-3 py-3", disabled ? "opacity-55" : "")}> 
      <div className="flex items-start justify-between gap-2">
        <span className="mt-[1px] rounded-[8px] border bg-surface-muted p-1.5">
          <Icon className="h-3.5 w-3.5 text-text-muted" />
        </span>
        <span className="flex-1">
          <p className="text-sm font-semibold text-text">{config.label}</p>
          <p className="text-xs text-text-muted">{config.description}</p>
        </span>
        <Button disabled={disabled} onClick={() => onAdd(config.type)} size="sm" type="button" variant="secondary">
          Add
        </Button>
      </div>
    </div>
  );
}

function SortableCanvasField({
  field,
  selected,
  disabled,
  targetSummary,
  onDelete,
  onDuplicate,
  onSelect,
  onRename,
  onToggleRequired,
  onOpenSettings
}: {
  field: FormFieldDefinition;
  selected: boolean;
  disabled: boolean;
  targetSummary: string | null;
  onDelete: (fieldId: string) => void;
  onDuplicate: (fieldId: string) => void;
  onSelect: (fieldId: string) => void;
  onRename: (fieldId: string, nextLabel: string) => void;
  onToggleRequired: (fieldId: string, nextRequired: boolean) => void;
  onOpenSettings: (fieldId: string) => void;
}) {
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({
    id: field.id,
    disabled
  });

  const style: CSSProperties = {
    transform: transformToCss(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.7 : 1
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className={cn("rounded-control border bg-surface p-3 transition-colors hover:bg-surface-muted", selected ? "border-accent/60" : "")}>
        <div className="flex items-start gap-2">
          <button
            aria-label="Drag field"
            className={cn(
              "mt-[2px] rounded-[8px] border bg-surface-muted p-1 text-text-muted",
              disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
            )}
            disabled={disabled}
            suppressHydrationWarning
            type="button"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <InlineEditableText
                className="truncate"
                disabled={disabled}
                onActivate={() => onSelect(field.id)}
                onCommit={(nextLabel) => onRename(field.id, nextLabel)}
                placeholder="Untitled field"
                value={field.label}
              />
              {field.required ? <span className="text-accent">*</span> : null}
            </div>
            <p className="truncate text-xs text-text-muted">{field.type} · {field.name}</p>
            {targetSummary ? <p className="truncate text-[11px] text-text-muted">{targetSummary}</p> : null}
          </div>

          <label className="inline-flex h-8 items-center gap-1 rounded-control border bg-surface-muted px-2 text-xs text-text">
            <Checkbox
              checked={field.required}
              disabled={disabled}
              onChange={(event) => onToggleRequired(field.id, event.target.checked)}
              onClick={(event) => event.stopPropagation()}
            />
            Required
          </label>

          <Button
            aria-label="Duplicate field"
            className="h-8 w-8 px-0"
            disabled={disabled}
            onClick={() => onDuplicate(field.id)}
            type="button"
            variant="ghost"
          >
            <Copy className="h-4 w-4" />
          </Button>

          <Button
            aria-label="Field settings"
            className="h-8 w-8 px-0"
            disabled={disabled}
            onClick={() => onOpenSettings(field.id)}
            type="button"
            variant="ghost"
          >
            <Settings2 className="h-4 w-4" />
          </Button>

          <Button
            aria-label="Remove field"
            className="h-8 w-8 px-0"
            disabled={disabled}
            onClick={() => onDelete(field.id)}
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FormFieldsVisualEditor({ orgSlug, formName, formDescription, formKind, schema, programNodes, onChange, view, disabled = false }: FormFieldsVisualEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const isRegistration = formKind === "program_registration";
  const nodeById = useMemo(() => new Map(programNodes.map((node) => [node.id, node])), [programNodes]);

  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [previewNodeId, setPreviewNodeId] = useState("");
  const [appliesToModeByFieldId, setAppliesToModeByFieldId] = useState<Record<string, "program" | "specific">>({});
  const [fieldKeyModeByFieldId, setFieldKeyModeByFieldId] = useState<Record<string, "auto" | "manual">>({});

  const pages = schema.pages ?? [];

  useEffect(() => {
    if (!activePageId || !pages.some((page) => page.id === activePageId)) {
      setActivePageId(pages[0]?.id ?? null);
    }
  }, [activePageId, pages]);

  const activePage = activePageId ? pages.find((page) => page.id === activePageId) ?? null : pages[0] ?? null;
  const allFields = useMemo(() => pages.flatMap((page) => page.fields), [pages]);
  const fields = activePage?.fields ?? [];
  const canEditFields = Boolean(activePage) && (isRegistration ? activePage?.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions : !activePage?.locked);

  function getFieldKeyMode(field: FormFieldDefinition, allCurrentFields: FormFieldDefinition[]) {
    const explicitMode = fieldKeyModeByFieldId[field.id];
    if (explicitMode) {
      return explicitMode;
    }

    const inferredAutoName = ensureUniqueFieldName(field.label, allCurrentFields, field.id);
    return field.name === inferredAutoName ? "auto" : "manual";
  }

  useEffect(() => {
    if (fields.length === 0) {
      setSelectedFieldId(null);
      return;
    }

    if (!selectedFieldId || !fields.some((field) => field.id === selectedFieldId)) {
      setSelectedFieldId(fields[0].id);
    }
  }, [fields, selectedFieldId]);

  useEffect(() => {
    const fieldIdSet = new Set(allFields.map((field) => field.id));

    setFieldKeyModeByFieldId((current) => {
      const nextEntries = Object.entries(current).filter(([fieldId]) => fieldIdSet.has(fieldId));
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [allFields]);

  const selectedField = selectedFieldId ? fields.find((field) => field.id === selectedFieldId) ?? null : null;
  const selectedFieldAppliesToMode =
    selectedField ? (appliesToModeByFieldId[selectedField.id] ?? (selectedField.targetNodeIds.length > 0 ? "specific" : "program")) : "program";

  useEffect(() => {
    if (previewNodeId && !programNodes.some((node) => node.id === previewNodeId)) {
      setPreviewNodeId("");
    }
  }, [previewNodeId, programNodes]);

  const { isOver: isCanvasDropTarget, setNodeRef: setCanvasDropRef } = useDroppable({
    id: "canvas-dropzone",
    disabled: disabled || !canEditFields
  });

  function updatePages(updater: (current: FormPage[]) => FormPage[]) {
    onChange({
      ...schema,
      pages: updater(schema.pages)
    });
  }

  function updateActivePage(updater: (page: FormPage) => FormPage) {
    if (!activePage) {
      return;
    }

    updatePages((current) => current.map((page) => (page.id === activePage.id ? updater(page) : page)));
  }

  function updateFields(updater: (current: FormFieldDefinition[]) => FormFieldDefinition[]) {
    if (!activePage) {
      return;
    }

    updateActivePage((page) => ({
      ...page,
      fields: updater(page.fields)
    }));
  }

  function updateField(fieldId: string, updater: (field: FormFieldDefinition) => FormFieldDefinition) {
    updateFields((current) => current.map((field) => (field.id === fieldId ? updater(field) : field)));
  }

  function renameField(fieldId: string, nextLabel: string) {
    updateFields((current) =>
      current.map((field) => {
        if (field.id !== fieldId) {
          return field;
        }

        const fieldKeyMode = getFieldKeyMode(field, current);
        return {
          ...field,
          label: nextLabel,
          name: fieldKeyMode === "auto" ? ensureUniqueFieldName(nextLabel, current, field.id) : field.name
        };
      })
    );
  }

  function insertField(fieldType: FormFieldType, overId: string | null) {
    const newField = createFieldForType(fieldType, allFields);

    updateFields((current) => {
      const next = [...current];
      const overIndex = overId ? current.findIndex((field) => field.id === overId) : -1;
      const insertIndex = overIndex >= 0 ? overIndex : next.length;
      next.splice(insertIndex, 0, newField);
      return next;
    });

    setSelectedFieldId(newField.id);
  }

  function addPage() {
    if (isRegistration) {
      return;
    }

    const nextPage: FormPage = {
      id: makeId("page"),
      pageKey: "generic_custom",
      title: `Page ${pages.length + 1}`,
      description: null,
      fields: [],
      successButtons: [],
      showSubmitAnotherResponseButton: false,
      locked: false
    };

    updatePages((current) => {
      const successPageIndex = current.findIndex((page) => page.pageKey === "generic_success");
      if (successPageIndex < 0) {
        return [...current, nextPage];
      }

      const next = [...current];
      next.splice(successPageIndex, 0, nextPage);
      return next;
    });
    setActivePageId(nextPage.id);
    setSelectedFieldId(null);
  }

  function deletePage(pageId: string) {
    if (isRegistration || pages.length <= 1) {
      return;
    }

    const page = pages.find((item) => item.id === pageId);
    if (page?.locked) {
      return;
    }

    updatePages((current) => current.filter((page) => page.id !== pageId));

    if (activePageId === pageId) {
      const remaining = pages.filter((page) => page.id !== pageId);
      setActivePageId(remaining[0]?.id ?? null);
      setSelectedFieldId(null);
    }
  }

  function reorderPages(nextPages: FormPage[]) {
    if (isRegistration) {
      return;
    }

    updatePages((current) => {
      const lockedIds = new Set(current.filter((page) => page.locked).map((page) => page.id));
      const movableQueue = nextPages.filter((page) => !lockedIds.has(page.id));

      return current.map((page) => {
        if (page.locked) {
          return page;
        }

        const nextMovable = movableQueue.shift();
        return nextMovable ?? page;
      });
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);

    setActiveDrag({
      kind: "canvas",
      fieldId: activeId
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : null;

    if (!activeDrag || !canEditFields) {
      return;
    }

    if (!overId) {
      setActiveDrag(null);
      return;
    }

    updateFields((current) => {
      const oldIndex = current.findIndex((field) => field.id === activeDrag.fieldId);
      if (oldIndex < 0) {
        return current;
      }

      const newIndex = overId === "canvas-dropzone" ? current.length - 1 : current.findIndex((field) => field.id === overId);
      if (newIndex < 0 || newIndex === oldIndex) {
        return current;
      }

      return arrayMove(current, oldIndex, newIndex);
    });

    setSelectedFieldId(activeDrag.fieldId);
    setActiveDrag(null);
  }

  function deleteField(fieldId: string) {
    updateFields((current) => current.filter((field) => field.id !== fieldId));

    if (selectedFieldId === fieldId) {
      const nextField = fields.find((field) => field.id !== fieldId) ?? null;
      setSelectedFieldId(nextField?.id ?? null);
      if (!nextField) {
        setSettingsPanelOpen(false);
      }
    }
  }

  function duplicateField(fieldId: string) {
    const sourceIndex = fields.findIndex((field) => field.id === fieldId);
    if (sourceIndex < 0) {
      return;
    }

    const sourceField = fields[sourceIndex];
    const duplicatedLabel = `${sourceField.label || "Field"} copy`;
    const duplicatedField: FormFieldDefinition = {
      ...sourceField,
      id: makeId("field"),
      label: duplicatedLabel,
      name: ensureUniqueFieldName(duplicatedLabel, allFields),
      options: sourceField.options.map((option) => ({ ...option })),
      targetNodeIds: [...sourceField.targetNodeIds]
    };

    updateFields((current) => {
      const insertAfter = current.findIndex((field) => field.id === fieldId);
      if (insertAfter < 0) {
        return current;
      }
      const next = [...current];
      next.splice(insertAfter + 1, 0, duplicatedField);
      return next;
    });
    setFieldKeyModeByFieldId((current) => ({
      ...current,
      [duplicatedField.id]: "auto"
    }));
    setSelectedFieldId(duplicatedField.id);
  }

  function addSelectOption(fieldId: string) {
    updateField(fieldId, (field) => {
      if (field.type !== "select") {
        return field;
      }

      const nextIndex = field.options.length + 1;
      const optionLabel = `Option ${nextIndex}`;
      const optionValue = ensureUniqueOptionValue(optionLabel, field.options);

      return {
        ...field,
        options: [
          ...field.options,
          {
            value: optionValue,
            label: optionLabel
          }
        ]
      };
    });
  }

  function updateSelectOption(fieldId: string, optionIndex: number, updater: (option: FormFieldOption) => FormFieldOption) {
    updateField(fieldId, (field) => {
      if (field.type !== "select") {
        return field;
      }

      return {
        ...field,
        options: field.options.map((option, index) => (index === optionIndex ? updater(option) : option))
      };
    });
  }

  function removeSelectOption(fieldId: string, optionIndex: number) {
    updateField(fieldId, (field) => {
      if (field.type !== "select") {
        return field;
      }

      return {
        ...field,
        options: field.options.filter((_, index) => index !== optionIndex)
      };
    });
  }

  const activeCanvasField = activeDrag?.kind === "canvas" ? fields.find((field) => field.id === activeDrag.fieldId) ?? null : null;

  const previewFields = useMemo(() => {
    if (!activePage) {
      return [];
    }

    if (!isRegistration || activePage.pageKey !== REGISTRATION_PAGE_KEYS.divisionQuestions) {
      return activePage.fields;
    }

    const selectedNodeId = previewNodeId || null;
    return activePage.fields.filter((field) => fieldMatchesNode(field, selectedNodeId, nodeById));
  }, [activePage, isRegistration, nodeById, previewNodeId]);

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-control border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Pages</p>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
          <SortableCanvas
            className="flex min-w-0 items-center gap-2"
            getId={(page) => page.id}
            items={pages}
            onReorder={reorderPages}
            renderItem={(page, meta) => (
              <div className={cn(meta.isDragging ? "shadow-card" : "shadow-none")}>
                <FormBuilderNavItem
                  canDelete={!isRegistration && !page.locked && pages.length > 1}
                  canMove={!isRegistration && !page.locked}
                  disabled={disabled}
                  dragAriaLabel={`Drag ${page.title || "page"}`}
                  dragHandleProps={
                    (!isRegistration && !page.locked
                      ? {
                          ...meta.handleProps.attributes,
                          ...meta.handleProps.listeners
                        }
                      : undefined) as ButtonHTMLAttributes<HTMLButtonElement> | undefined
                  }
                  isActive={page.id === activePage?.id}
                  label={page.title || "Untitled page"}
                  onDelete={() => deletePage(page.id)}
                  onEdit={() => {
                    setActivePageId(page.id);
                    setSelectedFieldId(null);
                  }}
                  onSelect={() => {
                    setActivePageId(page.id);
                    setSelectedFieldId(null);
                  }}
                />
              </div>
            )}
            sortingStrategy="horizontal"
          />
          {!isRegistration ? (
            <Button className="h-[38px] shrink-0 px-2" disabled={disabled} onClick={addPage} size="sm" type="button" variant="secondary">
              <Plus className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {activePage ? (
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Page title">
            <Input
              disabled={disabled}
              onChange={(event) => {
                updateActivePage((page) => ({
                  ...page,
                  title: event.target.value
                }));
              }}
              value={activePage.title}
            />
          </FormField>
          <FormField className="md:col-span-2" label="Page description">
            <Textarea
              className="min-h-[72px]"
              disabled={disabled}
              onChange={(event) => {
                updateActivePage((page) => ({
                  ...page,
                  description: event.target.value
                }));
              }}
              value={activePage.description ?? ""}
            />
          </FormField>
          {activePage.pageKey === "generic_success" || activePage.pageKey === REGISTRATION_PAGE_KEYS.success ? (
            <div className="space-y-3 rounded-control border bg-surface-muted/40 p-3 md:col-span-2">
              <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
                <Checkbox
                  checked={activePage.showSubmitAnotherResponseButton}
                  disabled={disabled}
                  onChange={(event) => {
                    updateActivePage((page) => ({
                      ...page,
                      showSubmitAnotherResponseButton: event.target.checked
                    }));
                  }}
                />
                Show "Submit another response" button
              </label>

              <ButtonListEditor
                addButtonLabel="Add success button"
                emptyStateText="No custom success buttons yet."
                maxButtons={4}
                onChange={(nextButtons) => {
                  updateActivePage((page) => ({
                    ...page,
                    successButtons: nextButtons
                  }));
                }}
                orgSlug={orgSlug}
                title="Success buttons"
                value={activePage.successButtons}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {view === "editor" ? (
        canEditFields ? (
          <DndContext
            collisionDetection={closestCenter}
            onDragCancel={() => setActiveDrag(null)}
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            sensors={sensors}
          >
            <div
              className={cn(
                "rounded-control border border-dashed bg-surface-muted/40 p-4",
                isCanvasDropTarget ? "border-accent bg-accent/10" : "border-border"
              )}
              ref={setCanvasDropRef}
            >
              {fields.length === 0 ? (
                <div className="space-y-4 py-8">
                  <div className="flex items-center justify-center">
                    <Alert className="max-w-md" variant="info">
                      Open the field library panel and add a field to start building this page.
                    </Alert>
                  </div>
                  <div className="flex justify-center">
                    <Button disabled={disabled} onClick={() => setLibraryPanelOpen(true)} type="button" variant="secondary">
                      <Plus className="h-4 w-4" />
                      Open field library
                    </Button>
                  </div>
                </div>
              ) : (
                <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2.5">
                    {fields.map((field) => (
                      <SortableCanvasField
                        disabled={disabled}
                        field={field}
                        key={field.id}
                        onDelete={deleteField}
                        onDuplicate={duplicateField}
                        onOpenSettings={(fieldId) => {
                          setSelectedFieldId(fieldId);
                          setSettingsPanelOpen(true);
                        }}
                        onRename={(fieldId, nextLabel) => {
                          renameField(fieldId, nextLabel);
                        }}
                        onSelect={setSelectedFieldId}
                        onToggleRequired={(fieldId, nextRequired) => {
                          updateField(fieldId, (currentField) => ({
                            ...currentField,
                            required: nextRequired
                          }));
                        }}
                        selected={selectedFieldId === field.id}
                        targetSummary={isRegistration ? fieldTargetSummary(field, programNodes) : null}
                      />
                    ))}
                    <div className="pt-1">
                      <Button disabled={disabled} onClick={() => setLibraryPanelOpen(true)} type="button" variant="secondary">
                        <Plus className="h-4 w-4" />
                        Open field library
                      </Button>
                    </div>
                  </div>
                </SortableContext>
              )}
            </div>

            <DragOverlay>
              {activeCanvasField ? (
                <div className="rounded-control border bg-surface px-3 py-2 shadow-card">
                  <p className="text-sm font-semibold text-text">{activeCanvasField.label || "Untitled field"}</p>
                  <p className="text-xs text-text-muted">{activeCanvasField.type}</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <Alert variant="info">
            {!isRegistration && activePage?.pageKey === "generic_success"
              ? "Success page is fixed in your form flow. Customize title/description here; field editing is disabled."
              : activePage?.pageKey === REGISTRATION_PAGE_KEYS.player
              ? "Player page is fixed. Configure title/description here; player selection UI is built-in."
              : activePage?.pageKey === REGISTRATION_PAGE_KEYS.success
                ? "Success page is fixed in your form flow. Customize title/description here; field editing is disabled."
              : "Payment page is fixed. Configure title/description here; payment placeholder UI is built-in."}
          </Alert>
        )
      ) : (
        <div className="space-y-4">
          <div className="rounded-control border bg-surface p-4">
            <h3 className="text-lg font-semibold text-text">{activePage?.title || formName || "Untitled form"}</h3>
            {activePage?.description ? <p className="mt-1 text-sm text-text-muted">{activePage.description}</p> : null}
            {!activePage?.description && formDescription.trim().length > 0 ? <p className="mt-1 text-sm text-text-muted">{formDescription}</p> : null}
          </div>

          {isRegistration && activePage?.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions ? (
            <FormField label="Preview selected division">
              <Select
                onChange={(event) => setPreviewNodeId(event.target.value)}
                options={[
                  { value: "", label: "No division selected" },
                  ...programNodes.map((node) => ({
                    value: node.id,
                    label: getNodeLabel(node)
                  }))
                ]}
                value={previewNodeId}
              />
            </FormField>
          ) : null}

          {previewFields.length === 0 ? (
            <Alert variant="info">
              {isRegistration && activePage?.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions
                ? "No fields match this previewed division selection."
                : "No fields yet. Open the field library to add fields."}
            </Alert>
          ) : (
            <div className="space-y-3 rounded-control border bg-surface p-4">{previewFields.map((field) => renderPreviewField(field))}</div>
          )}

          {isRegistration && activePage?.pageKey === REGISTRATION_PAGE_KEYS.payment ? (
            <Alert variant="info">Payment processor is not connected yet. This page currently acts as review + submit.</Alert>
          ) : null}

          <p className="text-xs text-text-muted">Preview is non-interactive in the editor.</p>
        </div>
      )}

      <Panel
        onClose={() => setSettingsPanelOpen(false)}
        open={settingsPanelOpen}
        subtitle="Configure the selected field."
        title={selectedField ? `Field settings: ${selectedField.label || "Untitled field"}` : "Field settings"}
      >
        {selectedField ? (
          <div className="space-y-3">
            <FormField label="Label">
              <Input
                disabled={disabled}
                onChange={(event) => {
                  const nextLabel = event.target.value;
                  renameField(selectedField.id, nextLabel);
                }}
                value={selectedField.label}
              />
            </FormField>

            <FormField hint="Unique key used in submission answers." label="Field key">
              <Input
                disabled={disabled}
                onChange={(event) => {
                  setFieldKeyModeByFieldId((current) => ({
                    ...current,
                    [selectedField.id]: "manual"
                  }));
                  updateField(selectedField.id, (field) => ({
                    ...field,
                    name: ensureUniqueFieldName(event.target.value, allFields, selectedField.id)
                  }));
                }}
                value={selectedField.name}
              />
            </FormField>

            <FormField label="Field type">
              <Select
                disabled={disabled}
                onChange={(event) => {
                  const nextType = event.target.value as FormFieldType;

                  updateField(selectedField.id, (field) => ({
                    ...field,
                    type: nextType,
                    placeholder: nextType === "checkbox" ? null : field.placeholder,
                    options:
                      nextType === "select"
                        ? field.options.length > 0
                          ? field.options
                          : [
                              {
                                value: "option_1",
                                label: "Option 1"
                              }
                            ]
                        : []
                  }));
                }}
                options={paletteFields.map((field) => ({
                  value: field.type,
                  label: field.label
                }))}
                value={selectedField.type}
              />
            </FormField>

            {selectedField.type !== "checkbox" ? (
              <FormField label="Placeholder">
                <Input
                  disabled={disabled}
                  onChange={(event) => {
                    updateField(selectedField.id, (field) => ({
                      ...field,
                      placeholder: event.target.value
                    }));
                  }}
                  value={selectedField.placeholder ?? ""}
                />
              </FormField>
            ) : null}

            <FormField label="Help text">
              <Textarea
                className="min-h-[80px]"
                disabled={disabled}
                onChange={(event) => {
                  updateField(selectedField.id, (field) => ({
                    ...field,
                    helpText: event.target.value
                  }));
                }}
                value={selectedField.helpText ?? ""}
              />
            </FormField>

            <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
              <Checkbox
                checked={selectedField.required}
                disabled={disabled}
                onChange={(event) => {
                  updateField(selectedField.id, (field) => ({
                    ...field,
                    required: event.target.checked
                  }));
                }}
              />
              Required field
            </label>

            {isRegistration && activePage?.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions ? (
              <div className="space-y-2 rounded-control border bg-surface-muted/40 p-3">
                <FormField label="Applies to">
                  <Select
                    disabled={disabled}
                    onChange={(event) => {
                      const mode = event.target.value;
                      setAppliesToModeByFieldId((current) => ({
                        ...current,
                        [selectedField.id]: mode === "specific" ? "specific" : "program"
                      }));

                      updateField(selectedField.id, (field) => ({
                        ...field,
                        targetNodeIds:
                          mode === "program"
                            ? []
                            : field.targetNodeIds.length > 0
                              ? field.targetNodeIds
                              : programNodes[0]
                                ? [programNodes[0].id]
                                : [],
                        includeDescendants: mode === "program" ? false : field.includeDescendants
                      }));
                    }}
                    options={[
                      { value: "program", label: "Program-wide" },
                      { value: "specific", label: "Specific structure nodes" }
                    ]}
                    value={selectedFieldAppliesToMode}
                  />
                </FormField>

                {selectedFieldAppliesToMode === "specific" ? (
                  <>
                    {programNodes.length === 0 ? <Alert variant="warning">No program nodes available. Add nodes in Program settings first.</Alert> : null}
                    {programNodes.length > 0 ? (
                      <div className="space-y-1">
                        {programNodes.map((node) => {
                          const isChecked = selectedField.targetNodeIds.includes(node.id);

                          return (
                            <label className="flex items-center gap-2 text-sm text-text" key={node.id}>
                              <Checkbox
                                checked={isChecked}
                                disabled={disabled}
                                onChange={(event) => {
                                  const checked = event.target.checked;
                                  updateField(selectedField.id, (field) => ({
                                    ...field,
                                    targetNodeIds: checked
                                      ? [...field.targetNodeIds, node.id]
                                      : field.targetNodeIds.filter((targetId) => targetId !== node.id)
                                  }));
                                }}
                              />
                              {getNodeLabel(node)}
                            </label>
                          );
                        })}
                      </div>
                    ) : null}

                    <label className="inline-flex items-center gap-2 text-sm text-text">
                      <Checkbox
                        checked={selectedField.includeDescendants}
                        disabled={disabled}
                        onChange={(event) => {
                          updateField(selectedField.id, (field) => ({
                            ...field,
                            includeDescendants: event.target.checked
                          }));
                        }}
                      />
                      Include child nodes
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}

            {selectedField.type === "select" ? (
              <div className="space-y-2 rounded-control border bg-surface-muted/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-text">Options</p>
                  <Button disabled={disabled} onClick={() => addSelectOption(selectedField.id)} size="sm" type="button" variant="secondary">
                    <Plus className="h-3.5 w-3.5" />
                    Add option
                  </Button>
                </div>
                <div className="space-y-2">
                  {selectedField.options.length === 0 ? <Alert variant="warning">Dropdown fields need at least one option.</Alert> : null}
                  {selectedField.options.map((option, optionIndex) => (
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2" key={`${selectedField.id}-option-${optionIndex}`}>
                      <Input
                        disabled={disabled}
                        onChange={(event) => {
                          const nextLabel = event.target.value;
                          updateSelectOption(selectedField.id, optionIndex, (currentOption) => ({
                            ...currentOption,
                            label: nextLabel
                          }));
                        }}
                        placeholder="Label"
                        value={option.label}
                      />
                      <Input
                        disabled={disabled}
                        onChange={(event) => {
                          updateSelectOption(selectedField.id, optionIndex, (currentOption) => ({
                            ...currentOption,
                            value: ensureUniqueOptionValue(event.target.value, selectedField.options, optionIndex)
                          }));
                        }}
                        placeholder="Value"
                        value={option.value}
                      />
                      <Button
                        aria-label="Remove option"
                        className="h-10 w-10 px-0"
                        disabled={disabled}
                        onClick={() => removeSelectOption(selectedField.id, optionIndex)}
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <Alert variant="info">Select a field and open settings from its gear icon.</Alert>
        )}
      </Panel>

      <Panel
        onClose={() => setLibraryPanelOpen(false)}
        open={libraryPanelOpen}
        subtitle="Click a field to add it to the canvas. Reorder fields directly on the canvas by dragging."
        title="Field library"
      >
        <div className="space-y-2">
          {paletteFields.map((field) => (
            <PaletteItem
              config={field}
              disabled={disabled}
              key={field.type}
              onAdd={(fieldType) => {
                insertField(fieldType, null);
              }}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
