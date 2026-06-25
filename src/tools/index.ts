import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod/v4";

import { ChatCraftError, ChatCraftSession, type OptimizationGoal } from "../core/index.js";

export const TOOL_NAMES = [
  "load_project",
  "export_project",
  "get_project_summary",
  "analyze_project",
  "compare_project_settings",
  "summarize_changes",
  "list_change_history",
  "revert_last_change",
  "reset_to_original",
  "list_objects",
  "list_regions",
  "get_object_settings",
  "get_region_settings",
  "scale_uniform",
  "scale_model",
  "set_infill_density",
  "set_infill_pattern",
  "set_wall_count",
  "set_wall_thickness",
  "set_top_layers",
  "set_bottom_layers",
  "toggle_supports",
  "set_support_type",
  "set_support_density",
  "set_support_setting",
  "set_per_object_setting",
  "set_region_layer_height",
  "set_region_infill",
  "suggest_optimizations",
  "suggest_strength_improvements",
  "suggest_speed_improvements",
  "suggest_material_adjustments",
  "suggest_support_adjustments"
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
export type ToolResult = Record<string, unknown>;

type ToolDefinition = {
  name: ToolName;
  description: string;
  inputSchema: Record<string, z.ZodType>;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  tool("load_project", "Load a .3mf project into an active ChatCraft session.", {
    file: z.string().min(1).describe("Local path to the .3mf file.")
  }),
  tool("export_project", "Export the active modified project to a .3mf file.", {
    output_file: z.string().min(1).optional().describe("Optional local output path.")
  }),
  tool("get_project_summary", "Return objects, regions, recognized settings, and pending change count."),
  tool("analyze_project", "Return deterministic analysis notes for the active project."),
  tool("compare_project_settings", "Compare original and pending project setting changes."),
  tool("summarize_changes", "Return a concise text summary of pending changes."),
  tool("list_change_history", "List reversible pending changes."),
  tool("revert_last_change", "Undo the latest pending change."),
  tool("reset_to_original", "Discard all pending changes and restore the original project state."),
  tool("list_objects", "List objects discovered in the 3MF model."),
  tool("list_regions", "List modifier/region metadata discovered in the project."),
  tool("get_object_settings", "Return recognized settings for one object.", {
    object_id: z.string().min(1)
  }),
  tool("get_region_settings", "Return recognized settings for one region.", {
    region_id: z.string().min(1)
  }),
  tool("scale_uniform", "Scale every build item uniformly.", {
    factor: z.number().positive()
  }),
  tool("scale_model", "Scale every build item independently on X/Y/Z.", {
    x: z.number().positive(),
    y: z.number().positive(),
    z: z.number().positive()
  }),
  tool("set_infill_density", "Set project infill density percentage.", {
    percent: z.number().min(0).max(100)
  }),
  tool("set_infill_pattern", "Set project infill pattern.", {
    pattern: z.string().min(1)
  }),
  tool("set_wall_count", "Set project wall/perimeter count.", {
    count: z.number().int().positive()
  }),
  tool("set_wall_thickness", "Set project wall thickness where supported.", {
    value: z.number().positive()
  }),
  tool("set_top_layers", "Set project top layer count.", {
    count: z.number().int().positive()
  }),
  tool("set_bottom_layers", "Set project bottom layer count.", {
    count: z.number().int().positive()
  }),
  tool("toggle_supports", "Enable or disable supports.", {
    enabled: z.boolean()
  }),
  tool("set_support_type", "Set support type.", {
    type: z.string().min(1)
  }),
  tool("set_support_density", "Set support density percentage.", {
    percent: z.number().min(0).max(100)
  }),
  tool("set_support_setting", "Set a recognized support setting by slicer key.", {
    name: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()])
  }),
  tool("set_per_object_setting", "Set a safely mapped per-object setting.", {
    object_id: z.string().min(1),
    setting: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()])
  }),
  tool("set_region_layer_height", "Set region-specific layer height where available.", {
    region_id: z.string().min(1),
    height: z.number().positive()
  }),
  tool("set_region_infill", "Set region-specific infill where available.", {
    region_id: z.string().min(1),
    pattern: z.string().min(1),
    density: z.number().min(0).max(100)
  }),
  tool("suggest_optimizations", "Return optional recommendations for a print goal.", {
    goal: z.enum(["strength", "speed", "material", "surface", "tpu", "supports"])
  }),
  tool("suggest_strength_improvements", "Return optional strength recommendations."),
  tool("suggest_speed_improvements", "Return optional speed recommendations."),
  tool("suggest_material_adjustments", "Return optional material recommendations.", {
    material: z.string().min(1)
  }),
  tool("suggest_support_adjustments", "Return optional support recommendations.")
];

export type ToolRuntime = ReturnType<typeof createToolRuntime>;

export function createToolRuntime() {
  const sessions = new Map<string, ChatCraftSession>();
  let activeSessionId: string | undefined;

  return {
    async call(name: ToolName, args: Record<string, unknown>): Promise<ToolResult> {
      switch (name) {
        case "load_project": {
          const file = stringArg(args, "file");
          const session = await ChatCraftSession.load(await readFile(file));
          const sessionId = randomUUID();
          sessions.set(sessionId, session);
          activeSessionId = sessionId;
          return { sessionId, summary: session.getProjectSummary() };
        }
        case "export_project": {
          const session = getSession(args);
          const bytes = await session.exportProject();
          const outputFile = optionalStringArg(args, "output_file") ?? join(await mkdtemp(join(tmpdir(), "chatcraft-export-")), "project.3mf");
          await writeFile(outputFile, bytes);
          return { file: outputFile, byteLength: bytes.byteLength };
        }
        case "get_project_summary":
          return { summary: getSession(args).getProjectSummary() };
        case "analyze_project":
          return { analysis: getSession(args).analyzeProject() };
        case "compare_project_settings":
          return { changes: getSession(args).compareProjectSettings() };
        case "summarize_changes":
          return { summary: getSession(args).summarizeChanges() };
        case "list_change_history":
          return { changes: getSession(args).listChangeHistory() };
        case "revert_last_change":
          getSession(args).revertLastChange();
          return { summary: getSession(args).getProjectSummary() };
        case "reset_to_original":
          getSession(args).resetToOriginal();
          return { summary: getSession(args).getProjectSummary() };
        case "list_objects":
          return { objects: getSession(args).listObjects() };
        case "list_regions":
          return { regions: getSession(args).listRegions() };
        case "get_object_settings":
          return { settings: getSession(args).getObjectSettings(stringArg(args, "object_id")) };
        case "get_region_settings":
          return { settings: getSession(args).getRegionSettings(stringArg(args, "region_id")) };
        case "scale_uniform":
          getSession(args).scaleUniform(numberArg(args, "factor"));
          return changed(getSession(args));
        case "scale_model":
          getSession(args).scaleModel(numberArg(args, "x"), numberArg(args, "y"), numberArg(args, "z"));
          return changed(getSession(args));
        case "set_infill_density":
          getSession(args).setInfillDensity(numberArg(args, "percent"));
          return changed(getSession(args));
        case "set_infill_pattern":
          getSession(args).setInfillPattern(stringArg(args, "pattern"));
          return changed(getSession(args));
        case "set_wall_count":
          getSession(args).setWallCount(numberArg(args, "count"));
          return changed(getSession(args));
        case "set_wall_thickness":
          getSession(args).setWallThickness(numberArg(args, "value"));
          return changed(getSession(args));
        case "set_top_layers":
          getSession(args).setTopLayers(numberArg(args, "count"));
          return changed(getSession(args));
        case "set_bottom_layers":
          getSession(args).setBottomLayers(numberArg(args, "count"));
          return changed(getSession(args));
        case "toggle_supports":
          getSession(args).toggleSupports(booleanArg(args, "enabled"));
          return changed(getSession(args));
        case "set_support_type":
          getSession(args).setSupportType(stringArg(args, "type"));
          return changed(getSession(args));
        case "set_support_density":
          getSession(args).setSupportDensity(numberArg(args, "percent"));
          return changed(getSession(args));
        case "set_support_setting":
          getSession(args).setSupportSetting(stringArg(args, "name"), scalarArg(args, "value"));
          return changed(getSession(args));
        case "set_per_object_setting":
          getSession(args).setPerObjectSetting(stringArg(args, "object_id"), stringArg(args, "setting"), scalarArg(args, "value"));
          return changed(getSession(args));
        case "set_region_layer_height":
          getSession(args).setRegionLayerHeight(stringArg(args, "region_id"), numberArg(args, "height"));
          return changed(getSession(args));
        case "set_region_infill":
          getSession(args).setRegionInfill(stringArg(args, "region_id"), stringArg(args, "pattern"), numberArg(args, "density"));
          return changed(getSession(args));
        case "suggest_optimizations":
          return { suggestions: getSession(args).suggestOptimizations(stringArg(args, "goal") as OptimizationGoal) };
        case "suggest_strength_improvements":
          return { suggestions: getSession(args).suggestStrengthImprovements() };
        case "suggest_speed_improvements":
          return { suggestions: getSession(args).suggestSpeedImprovements() };
        case "suggest_material_adjustments":
          return { suggestions: getSession(args).suggestMaterialAdjustments(stringArg(args, "material")) };
        case "suggest_support_adjustments":
          return { suggestions: getSession(args).suggestSupportAdjustments() };
        default:
          throw new ChatCraftError("unknown_tool", `Unknown ChatCraft tool: ${name}`);
      }
    }
  };

  function getSession(args: Record<string, unknown>) {
    const requested = optionalStringArg(args, "session_id");
    const sessionId = requested ?? activeSessionId;
    if (!sessionId) {
      throw new ChatCraftError("no_active_project", "Load a project before calling this tool.");
    }
    const session = sessions.get(sessionId);
    if (!session) {
      throw new ChatCraftError("unknown_session", `Unknown project session: ${sessionId}`);
    }
    return session;
  }
}

function tool(name: ToolName, description: string, inputSchema: Record<string, z.ZodType> = {}): ToolDefinition {
  return { name, description, inputSchema };
}

function changed(session: ChatCraftSession): ToolResult {
  return {
    summary: session.getProjectSummary(),
    changes: session.compareProjectSettings()
  };
}

function stringArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new ChatCraftError("invalid_tool_arguments", `Expected string argument: ${name}`);
  }
  return value;
}

function optionalStringArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new ChatCraftError("invalid_tool_arguments", `Expected optional string argument: ${name}`);
  }
  return value;
}

function numberArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ChatCraftError("invalid_tool_arguments", `Expected numeric argument: ${name}`);
  }
  return value;
}

function booleanArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (typeof value !== "boolean") {
    throw new ChatCraftError("invalid_tool_arguments", `Expected boolean argument: ${name}`);
  }
  return value;
}

function scalarArg(args: Record<string, unknown>, name: string) {
  const value = args[name];
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw new ChatCraftError("invalid_tool_arguments", `Expected scalar argument: ${name}`);
  }
  return value;
}
