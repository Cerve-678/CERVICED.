/** One row from get_my_provider_achievements(). The server owns the rules:
 *  which achievements exist, their targets, and what counts towards them. */
export interface ProviderAchievement {
  key: string;
  group: string;
  current: number;
  target: number;
  /** 'YYYY-MM-DD' once earned, otherwise null. */
  earned_on: string | null;
}

export interface ProviderAchievements {
  average_rating: number | null;
  achievements: ProviderAchievement[];
}
