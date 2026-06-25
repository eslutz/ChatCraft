import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { createToolRuntime, TOOL_NAMES } from "../../src/tools/index.js";
import { ChatCraftSession } from "../../src/core/index.js";
import { makeThreeMfProject } from "../helpers/threeMfFixture.js";

describe("ChatCraft tool runtime", () => {
  it("exposes the complete MVP tool catalog", () => {
    expect(TOOL_NAMES).toEqual([
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
    ]);
  });

  it("loads, edits, compares, and exports through AI-facing tools", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatcraft-tools-"));
    const input = join(dir, "input.3mf");
    const output = join(dir, "output.3mf");
    await writeFile(input, await makeThreeMfProject());

    const runtime = createToolRuntime();
    const loaded = await runtime.call("load_project", { file: input });
    expect(loaded.summary.pendingChangeCount).toBe(0);

    await runtime.call("set_infill_density", { percent: 25 });
    await runtime.call("set_wall_count", { count: 4 });
    const compare = await runtime.call("compare_project_settings", {});
    expect(compare.changes).toEqual([
      { scope: "project", setting: "Infill density", before: "15%", after: "25%" },
      { scope: "project", setting: "Wall count", before: "2", after: "4" }
    ]);

    const exported = await runtime.call("export_project", { output_file: output });
    expect(exported.file).toBe(output);
    await expect(stat(output)).resolves.toMatchObject({ isFile: expect.any(Function) });

    const reloaded = await ChatCraftSession.load(await readFile(output));
    expect(reloaded.getProjectSummary().settings.infillDensity).toBe(25);
    expect(reloaded.getProjectSummary().settings.wallCount).toBe(4);
  });

  it("requires a loaded project before editing tools can run", async () => {
    const runtime = createToolRuntime();

    await expect(runtime.call("set_infill_density", { percent: 25 })).rejects.toMatchObject({
      code: "no_active_project"
    });
  });
});
