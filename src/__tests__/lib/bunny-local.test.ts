import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import {
  deleteFromBunny,
  getBunnyPathFromUrl,
  localUploadFile,
  localUploadsAllowed,
  readLocalUpload,
  uploadToBunny,
} from "@/lib/bunny";

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const bunny = { BUNNY_STORAGE_API_KEY: "k", BUNNY_STORAGE_ZONE: "z", BUNNY_STORAGE_ENDPOINT: "e", BUNNY_CDN_URL: "https://cdn.x" };

describe("local photo storage (no Bunny credentials)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is used only on local runs without Bunny", () => {
    expect(localUploadsAllowed(env({ NODE_ENV: "development" }))).toBe(true);
    expect(localUploadsAllowed(env({ NODE_ENV: "development", ...bunny }))).toBe(false);
    expect(localUploadsAllowed(env({ NODE_ENV: "production" }))).toBe(false);
    expect(localUploadsAllowed(env({ NODE_ENV: "production", UPLOADS_LOCAL: "true", NEXT_PUBLIC_APP_URL: "https://naseebak.com" }))).toBe(false);
    expect(localUploadsAllowed(env({ NODE_ENV: "production", UPLOADS_LOCAL: "true", NEXT_PUBLIC_APP_URL: "http://localhost:3100" }))).toBe(true);
  });

  it("never resolves a path outside the uploads folder", () => {
    expect(localUploadFile("../../.env")).toBeNull();
    expect(localUploadFile("photos/u1/a.jpg")).not.toBeNull();
  });

  it("writes, serves and deletes a file", async () => {
    for (const k of Object.keys(bunny)) vi.stubEnv(k, "");
    const path = `photos/test-${randomUUID()}/a.jpg`;
    const url = await uploadToBunny(Buffer.from("img"), path, "image/jpeg");
    expect(url).toBe(`/api/dev/uploads/${path}`);
    expect(getBunnyPathFromUrl(url)).toBe(path);
    expect((await readLocalUpload(path))?.toString()).toBe("img");
    await deleteFromBunny(path);
    expect(existsSync(localUploadFile(path)!)).toBe(false);
  });
});
