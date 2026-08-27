import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Two audience rules for the provider's booking detail, both easy to
 * reintroduce because the fields sit next to each other on the same object:
 *
 *  - `bookingInstructions` is the PROVIDER's own instructions copy
 *    (PoliciesScreen / InfoRegScreen). Its audience is the client, so it
 *    belongs on the client's BookingDetailScreen and nowhere on a
 *    provider-facing surface.
 *  - A MOBILE provider travels to the client, so the appointment's venue is
 *    the client's address. The provider's own address-release policy has no
 *    bearing on it, and the Location row must report the client-address
 *    status instead.
 */
describe("provider booking surfaces show the client's side, not their own copy", () => {
  const detail = readFileSync(
    join(__dirname, "../screens/provider/ProviderBookingDetailScreen.tsx"),
    "utf8",
  );
  const home = readFileSync(
    join(__dirname, "../screens/provider/ProviderHomeScreen.tsx"),
    "utf8",
  );
  const clientDetail = readFileSync(
    join(__dirname, "../screens/client/BookingDetailScreen.tsx"),
    "utf8",
  );

  it("never renders the provider's own bookingInstructions back at them", () => {
    expect(detail).not.toContain("booking.bookingInstructions");
    expect(home).not.toContain("booking.bookingInstructions");
  });

  it("still shows those instructions to the client, who they were written for", () => {
    expect(clientDetail).toContain("booking.bookingInstructions");
  });

  it("gives both provider surfaces the client's note instead", () => {
    expect(detail).toContain("Client note");
    expect(detail).toContain("{booking.notes}");
    expect(home).toContain("booking.notes");
  });

  it("reports client-address status in Location for a mobile provider", () => {
    expect(detail).toContain("const isMobileProvider = addressSettings?.business_type === 'mobile'");
    expect(detail).toContain("Client address received");
    expect(detail).toContain("Waiting for client’s address");
    // The release states below it are for a provider whose OWN address is the
    // venue — never reachable on a mobile booking.
    const mobileBranch = detail.indexOf(") : isMobileProvider ? (");
    const releaseBranch = detail.indexOf("Send address to client");
    expect(mobileBranch).toBeGreaterThan(-1);
    expect(releaseBranch).toBeGreaterThan(mobileBranch);
  });

  it("answers nothing about the venue until it knows the business type", () => {
    // business_type arrives from an async fetch. While it was outstanding the
    // ternary defaulted to the non-mobile branch and fell through to
    // `booking.address` — provider_address_snapshot, which
    // claim_cart_booking_slots() stamps with the provider's OWN private street
    // address on every row, mobile included. It flashed up as the
    // appointment's Location and vanished when the policy landed.
    const guard = detail.indexOf("{!addressKnown ? (");
    const mobileBranch = detail.indexOf(") : isMobileProvider ? (");
    const ownAddressFallback = detail.indexOf("value={booking.address}");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(mobileBranch);
    // The provider's own address stays reachable — for a provider whose venue
    // genuinely is their own address — but only downstream of both gates.
    expect(ownAddressFallback).toBeGreaterThan(mobileBranch);
    // Loaded is tracked separately from the value: `addressSettings === null`
    // cannot tell "not back yet" from "no policy set".
    expect(detail).toContain("const [addressSettingsLoaded, setAddressSettingsLoaded]");
  });
});
