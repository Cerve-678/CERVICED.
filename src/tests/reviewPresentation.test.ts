import {
  mapProviderReviews,
  reviewerDisplayName,
  toMyProviderReview,
  toPublicReview,
  type MyProviderReviewRow,
} from "../features/providers/reviewPresentation";

const namedRow: MyProviderReviewRow = {
  id: "review-1",
  provider_id: "provider-1",
  rating: 5,
  comment: "Lovely",
  created_at: "2026-08-19T12:00:00.000Z",
  is_anonymous: false,
  reviewer_id: "user-1",
  reviewer_name: "Amara",
  reviewer_avatar_url: "https://example.test/a.png",
  booking_id: "booking-1",
  service_id: "service-1",
  tip_amount: 5,
};

describe("review presentation", () => {
  it("keeps the reviewer on a named review", () => {
    const review = toPublicReview(namedRow);
    expect(review.user_id).toBe("user-1");
    expect(review.user).toEqual({ name: "Amara", avatar_url: "https://example.test/a.png" });
    expect(reviewerDisplayName(review)).toBe("Amara");
  });

  it("never fills a reviewer back in on an anonymous review", () => {
    // Even if a row ever arrived carrying reviewer data, an anonymous review
    // must not show it.
    const leaky: MyProviderReviewRow = { ...namedRow, is_anonymous: true };

    const pub = toPublicReview(leaky);
    expect(pub.user_id).toBeNull();
    expect(pub.user).toEqual({ name: "", avatar_url: null });
    expect(reviewerDisplayName(pub)).toBe("Anonymous");

    const own = toMyProviderReview(leaky);
    expect(own.user_id).toBeNull();
    expect(own.booking_id).toBeNull();
    expect(own.service_id).toBeNull();
    expect(own.tip_amount).toBeNull();
    expect(own.user).toEqual({ name: "", avatar_url: null });
    expect(own.rating).toBe(5);
    expect(own.comment).toBe("Lovely");
  });

  it("keeps the booking link on the provider's own named review", () => {
    const own = toMyProviderReview(namedRow);
    expect(own.booking_id).toBe("booking-1");
    expect(own.service_id).toBe("service-1");
  });

  it("maps profile review cards, showing Anonymous for anonymous or nameless reviewers", () => {
    expect(
      mapProviderReviews([
        toPublicReview({ ...namedRow, is_anonymous: true }),
        toPublicReview({ ...namedRow, id: "review-2", reviewer_name: "   ", comment: null }),
        toPublicReview({ ...namedRow, id: "review-3" }),
      ]),
    ).toEqual([
      { id: "review-1", name: "Anonymous", rating: 5, comment: "Lovely", date: "19 Aug 2026" },
      { id: "review-2", name: "Anonymous", rating: 5, comment: "", date: "19 Aug 2026" },
      { id: "review-3", name: "Amara", rating: 5, comment: "Lovely", date: "19 Aug 2026" },
    ]);
  });
});
