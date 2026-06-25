export type CanonicalSettingKey =
  | "infillDensity"
  | "infillPattern"
  | "wallCount"
  | "wallThickness"
  | "topLayers"
  | "bottomLayers"
  | "supportsEnabled"
  | "supportType"
  | "supportDensity";

export type ProjectSettings = {
  infillDensity?: number;
  infillPattern?: string;
  wallCount?: number;
  wallThickness?: number;
  topLayers?: number;
  bottomLayers?: number;
  supportsEnabled?: boolean;
  supportType?: string;
  supportDensity?: number;
};

export type ProjectObject = {
  id: string;
  name: string;
};

export type ProjectRegion = {
  id: string;
  name: string;
};

export type ProjectSummary = {
  objects: ProjectObject[];
  regions: ProjectRegion[];
  settings: ProjectSettings;
  pendingChangeCount: number;
};

export type ChangeRecord = {
  id: string;
  scope: string;
  setting: string;
  before: string;
  after: string;
  canonicalKey?: CanonicalSettingKey;
  createdAt: string;
};

export type SettingComparison = Pick<ChangeRecord, "scope" | "setting" | "before" | "after">;

export type OptimizationGoal =
  | "strength"
  | "speed"
  | "material"
  | "surface"
  | "tpu"
  | "supports";

export type OptimizationSuggestion = {
  goal: OptimizationGoal;
  title: string;
  rationale: string;
  tools: string[];
  appliesAutomatically: false;
};

export type RawPackageEntry = {
  path: string;
  data: Uint8Array;
};
