import {
  getBookedClientContact,
  getProviderContactByDisplayName,
} from "../services/databaseService";
import { getCapability } from "../services/becca/registry";
import type { CapabilityContext } from "../services/becca/types";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";

jest.mock("../services/databaseService", () => ({
  getProviderContactByDisplayName: jest.fn(),
  getBookedClientContact: jest.fn(),
  getProviderIdByDisplayName: jest.fn().mockResolvedValue("provider-1"),
}));

const mockedPublic = getProviderContactByDisplayName as jest.MockedFunction<typeof getProviderContactByDisplayName>;
const mockedBooked = getBookedClientContact as jest.MockedFunction<typeof getBookedClientContact>;

/**
 * A provider can give booked clients different contact details from their
 * public ones (Communications → provider_booked_contact). Becca has to answer
 * the way that booking's Contact sheet does, or a client is handed the public
 * number their provider deliberately kept them off.
 */
function booking(status: BookingStatus, id = "booking-1"): ConfirmedBooking {
  return {
    id,
    providerId: "provider-1",
    providerName: "Lola Studio",
    status,
    bookingDate: "2026-11-02",
    bookingTime: "10:00:00",
  } as unknown as ConfirmedBooking;
}

function context(bookings: ConfirmedBooking[]): CapabilityContext {
  return {
    entities: {
      provider: {
        kind: "provider",
        value: { slug: "lola-studio", dbId: "provider-1", displayName: "Lola Studio" },
        confidence: 0.9,
        sourceText: "lola studio",
        label: "Lola Studio",
      },
    },
    hat: "client",
    rawMessage: "how do i contact lola studio",
    verbatimMessage: "how do i contact lola studio",
    bookings,
    now: new Date("2026-10-26T12:00:00Z"),
  };
}

describe("Becca's provider contact answer", () => {
  beforeEach(() => {
    mockedPublic.mockReset();
    mockedBooked.mockReset();
    mockedPublic.mockResolvedValue({
      preferred_contact_methods: ["in_app", "phone"],
      phone: "07000 000001",
      email: null,
      whatsapp_number: null,
    });
    mockedBooked.mockResolvedValue({
      preferred_contact_methods: ["in_app", "phone"],
      phone: "07000 000002",
      email: null,
      whatsapp_number: null,
    });
  });

  it("gives a client with a live booking the booked-client details", async () => {
    const result = await getCapability("provider.contact", "client")!.run(context([booking(BookingStatus.UPCOMING)]));
    expect(mockedBooked).toHaveBeenCalledWith("booking-1");
    expect(result.text).toContain("07000 000002");
    expect(result.text).not.toContain("07000 000001");
  });

  it("answers from the public details when there's no live booking", async () => {
    const result = await getCapability("provider.contact", "client")!.run(context([booking(BookingStatus.COMPLETED)]));
    expect(mockedBooked).not.toHaveBeenCalled();
    expect(result.text).toContain("07000 000001");
  });
});
