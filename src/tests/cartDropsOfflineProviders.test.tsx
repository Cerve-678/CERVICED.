import React from "react";
import { Alert } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { CartProvider, useCart, offlineProviderItems } from "../contexts/CartContext";
import type { CartItem } from "../contexts/CartContext";
import { storage } from "../utils/storage";
import {
  getLiveProviderIds,
  getProviderBySlug,
  getProviderIdByDisplayName,
} from "../services/databaseService";

jest.mock("../utils/storage", () => ({
  storage: { getItem: jest.fn(), setItem: jest.fn(() => Promise.resolve()) },
}));

jest.mock("../services/databaseService", () => ({
  getLiveProviderIds: jest.fn(),
  getProviderBySlug: jest.fn(),
  getProviderIdByDisplayName: jest.fn(),
}));

const item = (id: string, providerName: string, providerId?: string): CartItem =>
  ({
    id,
    providerName,
    providerDisplayName: providerName,
    providerSlug: providerName.toLowerCase(),
    ...(providerId ? { providerId } : {}),
    providerImage: null,
    providerService: "Nails",
    serviceName: "Gel",
    serviceDescription: "",
    price: 30,
    duration: "1 hr",
    quantity: 1,
    serviceId: `svc-${id}`,
    addedAt: "2026-11-13T10:00:00.000Z",
  }) as CartItem;

// The restore runs several awaits in sequence; under a full parallel test run
// that can pass waitFor's 1 s default.
const SLOW = { timeout: 5000 };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

describe("restoring a saved cart", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    (getProviderBySlug as jest.Mock).mockResolvedValue(null);
    (getProviderIdByDisplayName as jest.Mock).mockResolvedValue(null);
  });

  it("drops items from a provider who went offline, in one batched check", async () => {
    (storage.getItem as jest.Mock).mockResolvedValue([
      item("a", "Lola", "p-lola"),
      item("b", "Gone", "p-gone"),
      item("c", "Gone", "p-gone"),
    ]);
    (getLiveProviderIds as jest.Mock).mockResolvedValue(new Set(["p-lola"]));

    const { result } = renderHook(() => useCart(), { wrapper });

    await waitFor(() => expect(result.current.items.map((i) => i.id)).toEqual(["a"]), SLOW);
    expect(getLiveProviderIds).toHaveBeenCalledTimes(1);
    expect(getLiveProviderIds).toHaveBeenCalledWith(["p-lola", "p-gone"]);
    expect(alertSpy).toHaveBeenCalledWith(
      "Some items removed",
      "Gone is no longer available, so we removed them from your cart.",
    );
  });

  it("keeps everything when the live check itself fails", async () => {
    (storage.getItem as jest.Mock).mockResolvedValue([item("a", "Lola", "p-lola")]);
    (getLiveProviderIds as jest.Mock).mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useCart(), { wrapper });

    await waitFor(() => expect(getLiveProviderIds).toHaveBeenCalled(), SLOW);
    // The check is called in the same tick as the restore, before React has
    // rendered the restored items — let the rejection and render settle first.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(result.current.items.map((i) => i.id)).toEqual(["a"]);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("checks a re-linked item's provider too", async () => {
    (storage.getItem as jest.Mock).mockResolvedValue([item("a", "Lola")]);
    (getProviderBySlug as jest.Mock).mockResolvedValue({ id: "p-lola" });
    (getLiveProviderIds as jest.Mock).mockResolvedValue(new Set());

    const { result } = renderHook(() => useCart(), { wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(0), SLOW);
    expect(getLiveProviderIds).toHaveBeenCalledWith(["p-lola"]);
  });
});

describe("re-linking unlinked items", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    (getProviderIdByDisplayName as jest.Mock).mockResolvedValue(null);
  });

  it("looks each provider up once, not once per item", async () => {
    (storage.getItem as jest.Mock).mockResolvedValue([
      item("a", "Lola"),
      item("b", "Lola"),
      item("c", "Mia"),
    ]);
    (getProviderBySlug as jest.Mock).mockImplementation(async (slug: string) => ({ id: `p-${slug}` }));
    (getLiveProviderIds as jest.Mock).mockResolvedValue(new Set(["p-lola", "p-mia"]));

    const { result } = renderHook(() => useCart(), { wrapper });

    await waitFor(() => expect(getLiveProviderIds).toHaveBeenCalled(), SLOW);
    expect(getProviderBySlug).toHaveBeenCalledTimes(2);
    expect(getLiveProviderIds).toHaveBeenCalledWith(["p-lola", "p-mia"]);
    await waitFor(
      () => expect(result.current.items.map((i) => i.providerId)).toEqual(["p-lola", "p-lola", "p-mia"]),
      SLOW,
    );
  });
});

describe("offlineProviderItems", () => {
  it("ignores items with no resolved provider", () => {
    const items = [item("a", "Lola"), item("b", "Gone")];
    const byItem = new Map([["b", "p-gone"]]);
    expect(offlineProviderItems(items, byItem, new Set()).map((i) => i.id)).toEqual(["b"]);
  });
});
