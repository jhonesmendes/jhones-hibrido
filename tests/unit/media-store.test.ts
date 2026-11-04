import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildStorageKey,
  deleteMediaFile,
  isMountPoint,
  readMediaFile,
  resolveStorageKey,
  writeMediaFile,
} from "@/server/media/store";
import { retentionCutoff } from "@/server/media/maintenance";

describe("media store", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "vocero-media-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("monta a chave por organização e mês (UTC)", () => {
    expect(buildStorageKey("org_A1", "mm_x-Y_9", new Date("2026-03-31T23:30:00Z"))).toBe(
      "org_A1/2026-03/mm_x-Y_9"
    );
  });

  it("recusa ids que escapariam da pasta", () => {
    expect(() => buildStorageKey("../etc", "mm_1", new Date())).toThrow();
    expect(() => buildStorageKey("org", "a/b", new Date())).toThrow();
    expect(() => resolveStorageKey(root, "../fora")).toThrow();
    expect(() => resolveStorageKey(root, "/etc/passwd")).toThrow();
  });

  it("grava, lê e apaga sem deixar temporário para trás", async () => {
    const key = buildStorageKey("org1", "mm_1", new Date("2026-10-30T00:00:00Z"));
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
    await writeMediaFile(root, key, bytes);
    expect(await readMediaFile(root, key)).toEqual(bytes);
    expect(await readdir(path.join(root, "org1/2026-10"))).toEqual(["mm_1"]);
    await deleteMediaFile(root, key);
    expect(await readMediaFile(root, key)).toBeNull();
    // Apagar de novo não falha (idempotente).
    await expect(deleteMediaFile(root, key)).resolves.toBeUndefined();
  });

  it("pasta comum não é ponto de montagem", async () => {
    expect(await isMountPoint(root)).toBe(false);
  });
});

describe("retentionCutoff", () => {
  it("subtrai os dias da data de referência", () => {
    expect(retentionCutoff(30, new Date("2026-10-30T12:00:00Z")).toISOString()).toBe(
      "2026-09-30T12:00:00.000Z"
    );
  });
});
