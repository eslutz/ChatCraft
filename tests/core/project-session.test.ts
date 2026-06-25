import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  ChatCraftError,
  ChatCraftSession,
  type OptimizationGoal
} from "../../src/core/index.js";

async function makeProject(entries: Record<string, string | Uint8Array> = {}) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types></Types>");
  zip.file("_rels/.rels", "<Relationships></Relationships>");
  zip.file(
    "3D/3dmodel.model",
    `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="Calibration Cube" type="model"><mesh /></object>
    <object id="2" name="Handle" type="model"><mesh /></object>
  </resources>
  <build>
    <item objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
    <item objectid="2" transform="1 0 0 0 1 0 0 0 1 10 0 0" />
  </build>
</model>`
  );
  zip.file(
    "Metadata/project_settings.config",
    JSON.stringify(
      {
        sparse_infill_density: "15%",
        sparse_infill_pattern: "grid",
        wall_loops: "2",
        wall_thickness: "0.8",
        top_shell_layers: "3",
        bottom_shell_layers: "3",
        enable_support: "0",
        support_type: "normal(auto)",
        support_density: "15%"
      },
      null,
      2
    )
  );
  zip.file("Metadata/model_settings.config", "{}");
  zip.file("Metadata/unknown_vendor_blob.bin", new Uint8Array([1, 2, 3, 4]));

  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("ChatCraftSession", () => {
  it("rejects unsafe 3MF zip entries", async () => {
    const bytes = await makeProject({ "../outside.txt": "owned" });

    await expect(ChatCraftSession.load(bytes)).rejects.toMatchObject({
      code: "unsafe_zip_entry"
    });
  });

  it("loads project summary, settings, and objects from a 3MF package", async () => {
    const session = await ChatCraftSession.load(await makeProject());

    expect(session.getProjectSummary()).toEqual({
      objects: [
        { id: "1", name: "Calibration Cube" },
        { id: "2", name: "Handle" }
      ],
      regions: [],
      settings: {
        infillDensity: 15,
        infillPattern: "grid",
        wallCount: 2,
        wallThickness: 0.8,
        topLayers: 3,
        bottomLayers: 3,
        supportsEnabled: false,
        supportType: "normal(auto)",
        supportDensity: 15
      },
      pendingChangeCount: 0
    });
  });

  it("edits global settings, compares changes, and exports a reloadable 3MF", async () => {
    const session = await ChatCraftSession.load(await makeProject());

    session.setInfillDensity(25);
    session.setInfillPattern("gyroid");
    session.setWallCount(4);
    session.toggleSupports(true);

    expect(session.compareProjectSettings()).toEqual([
      { scope: "project", setting: "Infill density", before: "15%", after: "25%" },
      { scope: "project", setting: "Infill pattern", before: "grid", after: "gyroid" },
      { scope: "project", setting: "Wall count", before: "2", after: "4" },
      { scope: "project", setting: "Supports enabled", before: "false", after: "true" }
    ]);

    const exported = await session.exportProject();
    const reloaded = await ChatCraftSession.load(exported);

    expect(reloaded.getProjectSummary().settings.infillDensity).toBe(25);
    expect(reloaded.getProjectSummary().settings.infillPattern).toBe("gyroid");
    expect(reloaded.getProjectSummary().settings.wallCount).toBe(4);
    expect(reloaded.getProjectSummary().settings.supportsEnabled).toBe(true);

    const exportedZip = await JSZip.loadAsync(exported);
    await expect(
      exportedZip.file("Metadata/unknown_vendor_blob.bin")?.async("uint8array")
    ).resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("validates setting ranges and allowed enum values", async () => {
    const session = await ChatCraftSession.load(await makeProject());

    expect(() => session.setInfillDensity(101)).toThrow(ChatCraftError);
    expect(() => session.setSupportDensity(-1)).toThrow(ChatCraftError);
    expect(() => session.setWallCount(0)).toThrow(ChatCraftError);
    expect(() => session.setInfillPattern("moonbeams")).toThrow(ChatCraftError);
    expect(() => session.scaleUniform(Number.POSITIVE_INFINITY)).toThrow(ChatCraftError);
  });

  it("supports change history, single-step revert, and reset to original", async () => {
    const session = await ChatCraftSession.load(await makeProject());

    session.setTopLayers(5);
    session.setBottomLayers(6);

    expect(session.listChangeHistory()).toHaveLength(2);
    expect(session.getProjectSummary().settings.bottomLayers).toBe(6);

    session.revertLastChange();
    expect(session.getProjectSummary().settings.topLayers).toBe(5);
    expect(session.getProjectSummary().settings.bottomLayers).toBe(3);

    session.resetToOriginal();
    expect(session.listChangeHistory()).toEqual([]);
    expect(session.getProjectSummary().settings.topLayers).toBe(3);
  });

  it("updates build item transforms when scaling the whole model", async () => {
    const session = await ChatCraftSession.load(await makeProject());

    session.scaleUniform(2);
    const exported = await session.exportProject();
    const zip = await JSZip.loadAsync(exported);
    const model = await zip.file("3D/3dmodel.model")?.async("text");

    expect(model).toContain('transform="2 0 0 0 2 0 0 0 2 0 0 0"');
    expect(model).toContain('transform="2 0 0 0 2 0 0 0 2 20 0 0"');
  });

  it("returns informational optimization suggestions without modifying the project", async () => {
    const session = await ChatCraftSession.load(await makeProject());
    const before = session.compareProjectSettings();

    const suggestions = session.suggestOptimizations("strength" satisfies OptimizationGoal);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((suggestion) => suggestion.appliesAutomatically)).toBe(false);
    expect(session.compareProjectSettings()).toEqual(before);
  });
});
