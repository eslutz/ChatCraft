import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli.js";
import { ChatCraftSession } from "../../src/core/index.js";
import { makeThreeMfProject } from "../helpers/threeMfFixture.js";

describe("ChatCraft CLI", () => {
  it("prints a JSON project summary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatcraft-cli-"));
    const input = join(dir, "input.3mf");
    await writeFile(input, await makeThreeMfProject());
    const output: string[] = [];

    await runCli(["summary", input], {
      stdout: (line) => output.push(line),
      stderr: () => undefined
    });

    expect(JSON.parse(output.join("\n"))).toMatchObject({
      objects: [{ id: "1", name: "Calibration Cube" }],
      settings: { infillDensity: 15 }
    });
  });

  it("writes an edited 3MF file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatcraft-cli-"));
    const input = join(dir, "input.3mf");
    const output = join(dir, "edited.3mf");
    await writeFile(input, await makeThreeMfProject());

    await runCli(["edit", input, "--infill-density", "30", "--wall-count", "5", "--output", output], {
      stdout: () => undefined,
      stderr: () => undefined
    });

    const session = await ChatCraftSession.load(await readFile(output));
    expect(session.getProjectSummary().settings.infillDensity).toBe(30);
    expect(session.getProjectSummary().settings.wallCount).toBe(5);
  });
});
