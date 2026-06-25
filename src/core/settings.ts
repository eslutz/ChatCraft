import { ChatCraftError } from "./errors.js";
import type { CanonicalSettingKey, ProjectSettings } from "./types.js";

export type SettingDescriptor = {
  key: CanonicalSettingKey;
  label: string;
  slicerKey: string;
  format(value: unknown): string;
  parse(value: unknown): unknown;
  serialize(value: unknown): string;
};

const numericPercent = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace("%", "").trim());
  return undefined;
};

const numericValue = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.trim());
  return undefined;
};

const booleanValue = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return undefined;
};

export const SETTING_DESCRIPTORS: readonly SettingDescriptor[] = [
  {
    key: "infillDensity",
    label: "Infill density",
    slicerKey: "sparse_infill_density",
    parse: numericPercent,
    serialize: (value) => `${value}%`,
    format: (value) => `${value}%`
  },
  {
    key: "infillPattern",
    label: "Infill pattern",
    slicerKey: "sparse_infill_pattern",
    parse: (value) => String(value),
    serialize: (value) => String(value),
    format: (value) => String(value)
  },
  {
    key: "wallCount",
    label: "Wall count",
    slicerKey: "wall_loops",
    parse: numericValue,
    serialize: (value) => String(value),
    format: (value) => String(value)
  },
  {
    key: "wallThickness",
    label: "Wall thickness",
    slicerKey: "wall_thickness",
    parse: numericValue,
    serialize: (value) => String(value),
    format: (value) => String(value)
  },
  {
    key: "topLayers",
    label: "Top layers",
    slicerKey: "top_shell_layers",
    parse: numericValue,
    serialize: (value) => String(value),
    format: (value) => String(value)
  },
  {
    key: "bottomLayers",
    label: "Bottom layers",
    slicerKey: "bottom_shell_layers",
    parse: numericValue,
    serialize: (value) => String(value),
    format: (value) => String(value)
  },
  {
    key: "supportsEnabled",
    label: "Supports enabled",
    slicerKey: "enable_support",
    parse: booleanValue,
    serialize: (value) => (value ? "1" : "0"),
    format: (value) => String(value)
  },
  {
    key: "supportType",
    label: "Support type",
    slicerKey: "support_type",
    parse: (value) => String(value),
    serialize: (value) => String(value),
    format: (value) => String(value)
  },
  {
    key: "supportDensity",
    label: "Support density",
    slicerKey: "support_density",
    parse: numericPercent,
    serialize: (value) => `${value}%`,
    format: (value) => `${value}%`
  }
] as const;

export const DESCRIPTOR_BY_KEY = new Map(
  SETTING_DESCRIPTORS.map((descriptor) => [descriptor.key, descriptor])
);

export const DESCRIPTOR_BY_SLICER_KEY = new Map(
  SETTING_DESCRIPTORS.map((descriptor) => [descriptor.slicerKey, descriptor])
);

export const INFILL_PATTERNS = new Set([
  "grid",
  "gyroid",
  "honeycomb",
  "line",
  "rectilinear",
  "cubic",
  "adaptive cubic",
  "support cubic",
  "lightning",
  "concentric",
  "triangles",
  "tri-hexagon"
]);

export const SUPPORT_TYPES = new Set([
  "normal(auto)",
  "normal(manual)",
  "tree(auto)",
  "tree(manual)",
  "normal",
  "tree"
]);

export function parseProjectSettings(rawSettings: Record<string, unknown>): ProjectSettings {
  const settings: ProjectSettings = {};
  for (const descriptor of SETTING_DESCRIPTORS) {
    if (Object.prototype.hasOwnProperty.call(rawSettings, descriptor.slicerKey)) {
      const value = descriptor.parse(rawSettings[descriptor.slicerKey]);
      if (value !== undefined && value !== null && !Number.isNaN(value)) {
        settings[descriptor.key] = value as never;
      }
    }
  }
  return settings;
}

export function applyProjectSettingsToRaw(
  rawSettings: Record<string, unknown>,
  settings: ProjectSettings
) {
  for (const descriptor of SETTING_DESCRIPTORS) {
    const value = settings[descriptor.key];
    if (value !== undefined) {
      rawSettings[descriptor.slicerKey] = descriptor.serialize(value);
    }
  }
}

export function assertPercent(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new ChatCraftError("invalid_setting_value", `${label} must be between 0 and 100.`);
  }
}

export function assertPositiveInt(value: number, label: string, max = 99) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new ChatCraftError("invalid_setting_value", `${label} must be an integer from 1 to ${max}.`);
  }
}

export function assertPositiveNumber(value: number, label: string, max = 1000) {
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new ChatCraftError("invalid_setting_value", `${label} must be greater than 0 and at most ${max}.`);
  }
}

export function assertKnownInfillPattern(pattern: string) {
  if (!INFILL_PATTERNS.has(pattern.toLowerCase())) {
    throw new ChatCraftError("unsupported_setting_value", `Unsupported infill pattern: ${pattern}.`);
  }
}

export function assertKnownSupportType(type: string) {
  if (!SUPPORT_TYPES.has(type.toLowerCase())) {
    throw new ChatCraftError("unsupported_setting_value", `Unsupported support type: ${type}.`);
  }
}
