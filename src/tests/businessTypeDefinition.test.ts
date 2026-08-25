import { execSync } from "node:child_process";
import {
  BUSINESS_TYPE_META,
  BUSINESS_TYPE_OPTS,
  ADDRESS_RELEASE_BY_BUSINESS_TYPE,
  appointmentVenue,
  businessTypeLabel,
  providerTravelsToClient,
} from "../features/business-details/options";
import { isMobileBooking } from "../types/booking";

/**
 * Business type decides whose address an appointment happens at, so every
 * surface has to agree on what the four values mean. The union used to be
 * re-declared in eight files and the labels copy-pasted into five, which is
 * how a client-facing filter chip could offer a type the provider's own picker
 * didn't, and how one DB value could read as two different words.
 */
describe("business types are defined in one place", () => {
  it("declares the union exactly once, in types/database.ts", () => {
    // Any re-declaration is a second definition that can drift; the canonical
    // one is exported for everyone else to import.
    const hits = execSync(
      `grep -rln "'salon' | 'studio' | 'home_based' | 'mobile'\\|\\"salon\\" | \\"studio\\" | \\"home_based\\" | \\"mobile\\"" src --include=*.ts --include=*.tsx || true`,
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes("/tests/"));

    expect(hits).toEqual(["src/types/database.ts"]);
  });

  it("describes every type it offers, and offers every type it describes", () => {
    const metaKeys = Object.keys(BUSINESS_TYPE_META).sort();
    expect(BUSINESS_TYPE_OPTS.map((o) => o.value).sort()).toEqual(metaKeys);
    expect(Object.keys(ADDRESS_RELEASE_BY_BUSINESS_TYPE).sort()).toEqual(metaKeys);
    for (const opt of BUSINESS_TYPE_OPTS) {
      expect(opt.label).toBe(BUSINESS_TYPE_META[opt.value].label);
    }
  });

  it("puts the venue at the client for mobile and at the provider for the rest", () => {
    expect(appointmentVenue("mobile")).toBe("client");
    expect(providerTravelsToClient("mobile")).toBe(true);
    for (const type of ["salon", "studio", "home_based"] as const) {
      expect(appointmentVenue(type)).toBe("provider");
      expect(providerTravelsToClient(type)).toBe(false);
    }
  });

  it("treats an unset or unrecognised type as unknown, never as a venue", () => {
    expect(appointmentVenue(null)).toBeNull();
    expect(appointmentVenue(undefined)).toBeNull();
    // Raw column values reach this helper (isMobileBooking); a legacy value
    // must fall back, not crash on an undefined meta entry.
    expect(appointmentVenue("popup_stall" as never)).toBeNull();
    expect(businessTypeLabel(null)).toBe("Not set");
    expect(businessTypeLabel("")).toBe("Not set");
  });

  it("keeps isMobileBooking's fallback for a booking with no type", () => {
    expect(isMobileBooking({ providerBusinessType: "mobile" })).toBe(true);
    // Type wins over the fallback: a salon booking that carries a client
    // address is still not mobile.
    expect(
      isMobileBooking({ providerBusinessType: "studio", clientAddress: "98 Hainault Road" }),
    ).toBe(false);
    // No type at all — fall back to whether an address actually arrived.
    expect(isMobileBooking({ clientAddress: "98 Hainault Road" })).toBe(true);
    expect(isMobileBooking({ clientAddress: "  " })).toBe(false);
  });
});
