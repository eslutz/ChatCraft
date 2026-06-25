import JSZip from "jszip";

import { ChatCraftError, invariant } from "./errors.js";
import type { RawPackageEntry } from "./types.js";

const MAX_ENTRY_COUNT = 10_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

export type ThreeMfPackage = {
  entries: Map<string, Uint8Array>;
};

export async function readThreeMfPackage(bytes: Uint8Array): Promise<ThreeMfPackage> {
  const zip = await JSZip.loadAsync(bytes);
  const files = Object.values(zip.files).filter((file) => !file.dir);
  invariant(files.length <= MAX_ENTRY_COUNT, "too_many_zip_entries", "3MF package has too many entries.");

  const entries = new Map<string, Uint8Array>();
  let totalBytes = 0;

  for (const file of files) {
    validateEntryPath(file.name);
    const unsafeOriginalName = (file as { unsafeOriginalName?: string }).unsafeOriginalName;
    if (unsafeOriginalName && unsafeOriginalName !== file.name) {
      validateEntryPath(unsafeOriginalName);
    }
    const data = await file.async("uint8array");
    if (data.byteLength > MAX_ENTRY_BYTES) {
      throw new ChatCraftError("zip_entry_too_large", `3MF entry is too large: ${file.name}`);
    }
    totalBytes += data.byteLength;
    if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ChatCraftError("zip_too_large", "3MF package is too large after decompression.");
    }
    entries.set(file.name, data);
  }

  invariant(entries.has("3D/3dmodel.model"), "missing_model", "3MF package is missing 3D/3dmodel.model.");
  return { entries };
}

export async function writeThreeMfPackage(entries: Iterable<RawPackageEntry>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const entry of entries) {
    validateEntryPath(entry.path);
    zip.file(entry.path, entry.data, { binary: true });
  }
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

function validateEntryPath(path: string) {
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === ".." || segment === "") ||
    path.includes("\0")
  ) {
    throw new ChatCraftError("unsafe_zip_entry", `Unsafe 3MF ZIP entry path: ${path}`, { path });
  }
}
