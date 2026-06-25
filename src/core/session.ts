import { XMLBuilder, XMLParser } from "fast-xml-parser";

import { ChatCraftError, invariant } from "./errors.js";
import { readThreeMfPackage, writeThreeMfPackage, type ThreeMfPackage } from "./package.js";
import {
  applyProjectSettingsToRaw,
  assertKnownInfillPattern,
  assertKnownSupportType,
  assertPercent,
  assertPositiveInt,
  assertPositiveNumber,
  DESCRIPTOR_BY_KEY,
  parseProjectSettings
} from "./settings.js";
import type {
  CanonicalSettingKey,
  ChangeRecord,
  OptimizationGoal,
  OptimizationSuggestion,
  ProjectObject,
  ProjectRegion,
  ProjectSettings,
  ProjectSummary,
  SettingComparison
} from "./types.js";

const PROJECT_SETTINGS_PATH = "Metadata/project_settings.config";
const MODEL_PATH = "3D/3dmodel.model";

type ParsedModel = {
  document: Record<string, unknown>;
  objects: ProjectObject[];
  regions: ProjectRegion[];
};

export class ChatCraftSession {
  private packageEntries: Map<string, Uint8Array>;
  private originalSettings: ProjectSettings;
  private currentSettings: ProjectSettings;
  private rawProjectSettings: Record<string, unknown>;
  private parsedModel: ParsedModel;
  private originalModelXml: string;
  private history: ChangeRecord[] = [];
  private changeSequence = 0;

  private constructor(
    threeMfPackage: ThreeMfPackage,
    rawProjectSettings: Record<string, unknown>,
    parsedModel: ParsedModel,
    originalModelXml: string
  ) {
    this.packageEntries = new Map(threeMfPackage.entries);
    this.rawProjectSettings = structuredClone(rawProjectSettings);
    this.originalSettings = parseProjectSettings(rawProjectSettings);
    this.currentSettings = structuredClone(this.originalSettings);
    this.parsedModel = parsedModel;
    this.originalModelXml = originalModelXml;
  }

  static async load(bytes: Uint8Array): Promise<ChatCraftSession> {
    const threeMfPackage = await readThreeMfPackage(bytes);
    const rawSettings = parseRawProjectSettings(threeMfPackage.entries.get(PROJECT_SETTINGS_PATH));
    const modelXmlBytes = threeMfPackage.entries.get(MODEL_PATH);
    invariant(modelXmlBytes, "missing_model", "3MF package is missing 3D/3dmodel.model.");
    const modelXml = new TextDecoder().decode(modelXmlBytes);
    return new ChatCraftSession(
      threeMfPackage,
      rawSettings,
      parseModelXml(modelXml),
      modelXml
    );
  }

  getProjectSummary(): ProjectSummary {
    return {
      objects: [...this.parsedModel.objects],
      regions: [...this.parsedModel.regions],
      settings: structuredClone(this.currentSettings),
      pendingChangeCount: this.history.length
    };
  }

  listObjects(): ProjectObject[] {
    return [...this.parsedModel.objects];
  }

  listRegions(): ProjectRegion[] {
    return [...this.parsedModel.regions];
  }

  getObjectSettings(objectId: string): Record<string, unknown> {
    this.assertObjectExists(objectId);
    return {};
  }

  getRegionSettings(regionId: string): Record<string, unknown> {
    this.assertRegionExists(regionId);
    return {};
  }

  setInfillDensity(percent: number) {
    assertPercent(percent, "Infill density");
    this.setSetting("infillDensity", percent);
  }

  setInfillPattern(pattern: string) {
    assertKnownInfillPattern(pattern);
    this.setSetting("infillPattern", pattern.toLowerCase());
  }

  setWallCount(count: number) {
    assertPositiveInt(count, "Wall count", 20);
    this.setSetting("wallCount", count);
  }

  setWallThickness(value: number) {
    assertPositiveNumber(value, "Wall thickness", 20);
    this.setSetting("wallThickness", value);
  }

  setTopLayers(count: number) {
    assertPositiveInt(count, "Top layers", 50);
    this.setSetting("topLayers", count);
  }

  setBottomLayers(count: number) {
    assertPositiveInt(count, "Bottom layers", 50);
    this.setSetting("bottomLayers", count);
  }

  toggleSupports(enabled: boolean) {
    this.setSetting("supportsEnabled", enabled);
  }

  setSupportType(type: string) {
    assertKnownSupportType(type);
    this.setSetting("supportType", type.toLowerCase());
  }

  setSupportDensity(percent: number) {
    assertPercent(percent, "Support density");
    this.setSetting("supportDensity", percent);
  }

  setSupportSetting(name: string, value: string | number | boolean) {
    const descriptor = [...DESCRIPTOR_BY_KEY.values()].find((candidate) => candidate.slicerKey === name);
    if (!descriptor || !descriptor.key.startsWith("support")) {
      throw new ChatCraftError("unsupported_setting", `Unsupported support setting: ${name}`);
    }
    this.setSetting(descriptor.key, value as never);
  }

  setPerObjectSetting(objectId: string, setting: string, _value: string | number | boolean) {
    this.assertObjectExists(objectId);
    throw new ChatCraftError("unsupported_mvp_feature", `Per-object setting is not safely mapped yet: ${setting}`);
  }

  setRegionLayerHeight(regionId: string, _height: number) {
    this.assertRegionExists(regionId);
    throw new ChatCraftError("unsupported_mvp_feature", "Region layer height editing is not safely mapped yet.");
  }

  setRegionInfill(regionId: string, _pattern: string, _density: number) {
    this.assertRegionExists(regionId);
    throw new ChatCraftError("unsupported_mvp_feature", "Region infill editing is not safely mapped yet.");
  }

  scaleUniform(factor: number) {
    this.scaleModel(factor, factor, factor);
  }

  scaleModel(x: number, y: number, z: number) {
    assertPositiveNumber(x, "X scale", 100);
    assertPositiveNumber(y, "Y scale", 100);
    assertPositiveNumber(z, "Z scale", 100);
    scaleBuildItems(this.parsedModel.document, x, y, z);
    this.recordChange("project", "Scale", "1,1,1", `${x},${y},${z}`);
  }

  listChangeHistory(): ChangeRecord[] {
    return structuredClone(this.history);
  }

  revertLastChange() {
    const change = this.history.pop();
    if (!change) return;
    if (change.canonicalKey) {
      const originalValue = this.originalSettings[change.canonicalKey];
      const priorChange = [...this.history]
        .reverse()
        .find((candidate) => candidate.canonicalKey === change.canonicalKey);
      const priorValue = priorChange?.after
        ? parseHistoryValue(change.canonicalKey, priorChange.after)
        : originalValue;
      this.currentSettings[change.canonicalKey] = priorValue as never;
    } else if (change.setting === "Scale") {
      this.parsedModel = parseModelXml(this.originalModelXml);
      for (const retainedChange of this.history.filter((candidate) => candidate.setting === "Scale")) {
        const [_x, _y, _z] = retainedChange.after.split(",").map(Number);
        scaleBuildItems(this.parsedModel.document, _x, _y, _z);
      }
    }
  }

  resetToOriginal() {
    this.currentSettings = structuredClone(this.originalSettings);
    this.parsedModel = parseModelXml(this.originalModelXml);
    this.history = [];
  }

  compareProjectSettings(): SettingComparison[] {
    return this.history.map(({ scope, setting, before, after }) => ({ scope, setting, before, after }));
  }

  summarizeChanges(): string {
    if (this.history.length === 0) return "No pending changes.";
    return this.compareProjectSettings()
      .map((change) => `${change.setting}: ${change.before} -> ${change.after}`)
      .join("\n");
  }

  analyzeProject() {
    const settings = this.currentSettings;
    return {
      objectCount: this.parsedModel.objects.length,
      regionCount: this.parsedModel.regions.length,
      settings,
      notes: [
        settings.infillDensity !== undefined && settings.infillDensity < 15
          ? "Low infill may reduce part strength."
          : undefined,
        settings.supportsEnabled ? "Supports are enabled." : "Supports are disabled."
      ].filter(Boolean)
    };
  }

  suggestOptimizations(goal: OptimizationGoal): OptimizationSuggestion[] {
    const settings = this.currentSettings;
    const suggestions: OptimizationSuggestion[] = [];
    if (goal === "strength") {
      if ((settings.infillDensity ?? 0) < 25) {
        suggestions.push({
          goal,
          title: "Increase infill density",
          rationale: "A moderate infill increase improves internal strength without switching to a slicer.",
          tools: ["set_infill_density"],
          appliesAutomatically: false
        });
      }
      if ((settings.wallCount ?? 0) < 4) {
        suggestions.push({
          goal,
          title: "Increase wall count",
          rationale: "Additional perimeters usually improve functional part strength more efficiently than very high infill.",
          tools: ["set_wall_count"],
          appliesAutomatically: false
        });
      }
    }
    if (goal === "speed") {
      suggestions.push({
        goal,
        title: "Reduce infill or supports",
        rationale: "Lower infill and fewer support structures are typical print-time reducers when acceptable for the model.",
        tools: ["set_infill_density", "toggle_supports"],
        appliesAutomatically: false
      });
    }
    if (goal === "tpu") {
      suggestions.push({
        goal,
        title: "Use conservative flexible-material settings",
        rationale: "TPU often benefits from lower speed, moderate infill, and fewer aggressive support interfaces.",
        tools: ["set_infill_pattern", "set_support_setting"],
        appliesAutomatically: false
      });
    }
    if (suggestions.length === 0) {
      suggestions.push({
        goal,
        title: "Review slicer preview",
        rationale: "This project does not expose enough recognized settings for a specific automatic recommendation.",
        tools: ["analyze_project"],
        appliesAutomatically: false
      });
    }
    return suggestions;
  }

  suggestStrengthImprovements() {
    return this.suggestOptimizations("strength");
  }

  suggestSpeedImprovements() {
    return this.suggestOptimizations("speed");
  }

  suggestMaterialAdjustments(material: string) {
    return this.suggestOptimizations(material.toLowerCase() === "tpu" ? "tpu" : "material");
  }

  suggestSupportAdjustments() {
    return this.suggestOptimizations("supports");
  }

  async exportProject(): Promise<Uint8Array> {
    const rawSettings = structuredClone(this.rawProjectSettings);
    applyProjectSettingsToRaw(rawSettings, this.currentSettings);
    this.packageEntries.set(PROJECT_SETTINGS_PATH, new TextEncoder().encode(JSON.stringify(rawSettings, null, 2)));
    this.packageEntries.set(MODEL_PATH, new TextEncoder().encode(buildModelXml(this.parsedModel.document)));
    return writeThreeMfPackage(
      [...this.packageEntries.entries()].map(([path, data]) => ({
        path,
        data
      }))
    );
  }

  private setSetting(key: CanonicalSettingKey, value: ProjectSettings[CanonicalSettingKey]) {
    const descriptor = DESCRIPTOR_BY_KEY.get(key);
    invariant(descriptor, "unknown_setting", `Unknown setting: ${key}`);
    const before = this.currentSettings[key];
    if (before === value) return;
    this.currentSettings[key] = value as never;
    this.recordChange(
      "project",
      descriptor.label,
      before === undefined ? "unset" : descriptor.format(before),
      descriptor.format(value),
      key
    );
  }

  private recordChange(
    scope: string,
    setting: string,
    before: string,
    after: string,
    canonicalKey?: CanonicalSettingKey
  ) {
    this.history.push({
      id: `change_${++this.changeSequence}`,
      scope,
      setting,
      before,
      after,
      canonicalKey,
      createdAt: new Date().toISOString()
    });
  }

  private assertObjectExists(objectId: string) {
    if (!this.parsedModel.objects.some((object) => object.id === objectId)) {
      throw new ChatCraftError("unknown_object", `Unknown object id: ${objectId}`);
    }
  }

  private assertRegionExists(regionId: string) {
    if (!this.parsedModel.regions.some((region) => region.id === regionId)) {
      throw new ChatCraftError("unknown_region", `Unknown region id: ${regionId}`);
    }
  }
}

function parseRawProjectSettings(bytes: Uint8Array | undefined): Record<string, unknown> {
  if (!bytes) return {};
  const text = new TextDecoder().decode(bytes).trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const settings: Record<string, unknown> = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) settings[match[1].trim()] = match[2].trim();
    }
    return settings;
  }
}

function parseModelXml(xml: string): ParsedModel {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: false
  });
  const document = parser.parse(xml) as Record<string, unknown>;
  const model = document.model as Record<string, unknown> | undefined;
  const resources = model?.resources as Record<string, unknown> | undefined;
  const rawObjects = toArray(resources?.object);
  const objects = rawObjects
    .map((object) => object as Record<string, unknown>)
    .map((object) => ({
      id: String(object["@_id"]),
      name: typeof object["@_name"] === "string" ? object["@_name"] : `Object ${object["@_id"]}`
    }))
    .filter((object) => object.id && object.id !== "undefined");
  return { document, objects, regions: [] };
}

function buildModelXml(document: Record<string, unknown>) {
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    suppressEmptyNode: true
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build(document)}`;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function scaleBuildItems(document: Record<string, unknown>, x: number, y: number, z: number) {
  const model = document.model as Record<string, unknown> | undefined;
  const build = model?.build as Record<string, unknown> | undefined;
  const items = toArray(build?.item) as Record<string, unknown>[];
  for (const item of items) {
    const matrix = parseTransform(item["@_transform"]);
    const scaled = [
      matrix[0] * x,
      matrix[1] * y,
      matrix[2] * z,
      matrix[3] * x,
      matrix[4] * y,
      matrix[5] * z,
      matrix[6] * x,
      matrix[7] * y,
      matrix[8] * z,
      matrix[9] * x,
      matrix[10] * y,
      matrix[11] * z
    ];
    item["@_transform"] = scaled.map(formatNumber).join(" ");
  }
}

function parseTransform(transform: unknown): number[] {
  if (typeof transform !== "string") return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const values = transform.split(/\s+/).map(Number);
  if (values.length !== 12 || values.some((value) => !Number.isFinite(value))) {
    throw new ChatCraftError("invalid_transform", "Model build item contains an invalid transform matrix.");
  }
  return values;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value.toFixed(6)).toString();
}

function parseHistoryValue(key: CanonicalSettingKey, formatted: string): unknown {
  const descriptor = DESCRIPTOR_BY_KEY.get(key);
  if (!descriptor) return formatted;
  return descriptor.parse(formatted);
}
