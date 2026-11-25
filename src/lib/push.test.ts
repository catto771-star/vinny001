import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./push";

describe("push", () => {
  it("chave VAPID em base64url vira bytes (65 bytes, começa com 0x04)", () => {
    const key = "BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const bytes = urlBase64ToUint8Array(key);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
    expect(urlBase64ToUint8Array("_-8")).toEqual(Uint8Array.from([0xff, 0xef]));
  });
});
