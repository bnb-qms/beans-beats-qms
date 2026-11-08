import { describe, expect, it } from "vitest";
import {
  hashCode,
  isScanOutcome,
  orderLabel,
  parseReadyCodes,
  trackingCodeFromQr,
} from "./scan";

const code = "a".repeat(64);

describe("trackingCodeFromQr", () => {
  it("reads the code from a tracking link or a bare code", () => {
    expect(
      trackingCodeFromQr(`https://bnb-qms.vercel.app/o/track#${code}`),
    ).toBe(code);
    expect(trackingCodeFromQr(` ${code} `)).toBe(code);
  });

  it("ignores any other QR", () => {
    expect(trackingCodeFromQr("https://example.com/menu")).toBeNull();
    expect(trackingCodeFromQr(`https://x.app/o/other#${code}`)).toBeNull();
    expect(trackingCodeFromQr(`https://x.app/o/track#${code}0`)).toBeNull();
    expect(trackingCodeFromQr("hello")).toBeNull();
  });
});

describe("hashCode", () => {
  it("matches the database SHA-256 hex", async () => {
    expect(await hashCode("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("response checks", () => {
  it("accepts only known scan results", () => {
    const outcome = {
      result: "collected",
      order_number: 12,
      customer_first_name: "Mei",
    };
    expect(isScanOutcome(outcome)).toBe(true);
    expect(isScanOutcome({ ...outcome, result: "deleted" })).toBe(false);
    expect(isScanOutcome({ ...outcome, order_number: 0 })).toBe(false);
  });

  it("parses the ready list and rejects bad hashes", () => {
    const row = {
      code_hash: "b".repeat(64),
      order_number: 3,
      customer_first_name: "",
    };
    expect(parseReadyCodes([row])).toEqual([row]);
    expect(parseReadyCodes([{ ...row, code_hash: "x" }])).toBeNull();
    expect(parseReadyCodes({})).toBeNull();
  });

  it("labels orders with or without a name", () => {
    expect(orderLabel({ order_number: 12, customer_first_name: "Mei" })).toBe(
      "#12 Mei",
    );
    expect(orderLabel({ order_number: 12, customer_first_name: " " })).toBe(
      "#12",
    );
  });
});
