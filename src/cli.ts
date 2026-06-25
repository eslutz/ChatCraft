#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

import { Command } from "commander";

import { ChatCraftError, ChatCraftSession } from "./core/index.js";

export type CliIo = {
  stdout(line: string): void;
  stderr(line: string): void;
};

export async function runCli(argv: string[], io: CliIo = defaultIo()) {
  const program = new Command();
  program
    .name("chatcraft")
    .description("Safe tool-based .3mf project editor.")
    .exitOverride();

  program
    .command("summary")
    .argument("<file>", "Path to a .3mf project")
    .description("Print a JSON project summary.")
    .action(async (file: string) => {
      const session = await ChatCraftSession.load(await readFile(file));
      io.stdout(JSON.stringify(session.getProjectSummary(), null, 2));
    });

  program
    .command("edit")
    .argument("<file>", "Path to a .3mf project")
    .requiredOption("-o, --output <file>", "Output .3mf path")
    .option("--infill-density <percent>", "Set infill density percentage", parseNumber)
    .option("--infill-pattern <pattern>", "Set infill pattern")
    .option("--wall-count <count>", "Set wall count", parseNumber)
    .option("--top-layers <count>", "Set top layers", parseNumber)
    .option("--bottom-layers <count>", "Set bottom layers", parseNumber)
    .option("--supports <enabled>", "Enable or disable supports", parseBoolean)
    .description("Apply supported global edits and write a new .3mf.")
    .action(async (file: string, options: Record<string, unknown>) => {
      const session = await ChatCraftSession.load(await readFile(file));
      if (typeof options.infillDensity === "number") session.setInfillDensity(options.infillDensity);
      if (typeof options.infillPattern === "string") session.setInfillPattern(options.infillPattern);
      if (typeof options.wallCount === "number") session.setWallCount(options.wallCount);
      if (typeof options.topLayers === "number") session.setTopLayers(options.topLayers);
      if (typeof options.bottomLayers === "number") session.setBottomLayers(options.bottomLayers);
      if (typeof options.supports === "boolean") session.toggleSupports(options.supports);
      await writeFile(String(options.output), await session.exportProject());
      io.stdout(session.summarizeChanges());
    });

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    if (error instanceof ChatCraftError) {
      io.stderr(`${error.code}: ${error.message}`);
      throw error;
    }
    throw error;
  }
}

function parseNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected number, got: ${value}`);
  }
  return parsed;
}

function parseBoolean(value: string) {
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`Expected boolean, got: ${value}`);
}

function defaultIo(): CliIo {
  return {
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line)
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2)).catch(() => {
    process.exitCode = 1;
  });
}
