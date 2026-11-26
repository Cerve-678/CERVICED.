import type { PublicReviewWithUser, ReviewWithUser } from "../../types/database";

/**
 * Reviews reach the app through two database readers,
 * get_provider_reviews and get_my_provider_reviews. On an anonymous review
 * they already return no reviewer, booking, service or tip: the database is
 * where that is enforced. These mappers only shape the rows, and never fill a
 * blank back in.
 */

/** One row of get_provider_reviews. */
export interface PublicReviewRow {
  id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  is_anonymous: boolean;
  reviewer_id: string | null;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
}

/** One row of get_my_provider_reviews. */
export interface MyProviderReviewRow extends PublicReviewRow {
  booking_id: string | null;
  service_id: string | null;
  tip_amount: number | null;
}

const reviewerOf = (row: PublicReviewRow): PublicReviewWithUser["user"] =>
  row.is_anonymous
    ? { name: "", avatar_url: null }
    : { name: row.reviewer_name ?? "", avatar_url: row.reviewer_avatar_url };

export const toPublicReview = (row: PublicReviewRow): PublicReviewWithUser => ({
  id: row.id,
  provider_id: row.provider_id,
  rating: row.rating,
  comment: row.comment,
  created_at: row.created_at,
  is_anonymous: row.is_anonymous,
  user_id: row.is_anonymous ? null : row.reviewer_id,
  user: reviewerOf(row),
});

export const toMyProviderReview = (row: MyProviderReviewRow): ReviewWithUser => ({
  id: row.id,
  provider_id: row.provider_id,
  rating: row.rating,
  comment: row.comment,
  created_at: row.created_at,
  is_anonymous: row.is_anonymous,
  user_id: row.is_anonymous ? null : row.reviewer_id,
  booking_id: row.is_anonymous ? null : row.booking_id,
  service_id: row.is_anonymous ? null : row.service_id,
  tip_amount: row.is_anonymous ? null : row.tip_amount,
  user: reviewerOf(row),
});

/** The name a review card shows. */
export const reviewerDisplayName = (
  review: Pick<PublicReviewWithUser, "is_anonymous" | "user">,
): string =>
  review.is_anonymous ? "Anonymous" : review.user?.name?.trim() || "Anonymous";

export interface ProviderReviewItem {
  id: number | string;
  name: string;
  rating: number;
  comment: string;
  date: string;
}

/** Review cards on a provider profile (the client's view and My Profile). */
export const mapProviderReviews = (
  rows: readonly PublicReviewWithUser[],
): ProviderReviewItem[] =>
  rows.map((review) => ({
    id: review.id,
    name: reviewerDisplayName(review),
    rating: review.rating,
    comment: review.comment ?? "",
    date: new Date(review.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  }));
