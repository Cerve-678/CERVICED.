/**
 * The words and order of the My Profile spotlight tour. Kept apart from the
 * screen so the copy can be tested; the screen adds a ref to each step by key.
 *
 * Every step points at something drawn at the top of My Profile when it
 * opens. The quick-action tiles live far down under Manage, so they aren't a
 * step: CoachMarkTour skips anything off screen, and a step that is nearly
 * always skipped is just dead copy.
 */

export type MyProfileTourKey = 'logo' | 'edit' | 'shortcuts' | 'tabs' | 'status';

export interface MyProfileTourStep {
  key: MyProfileTourKey;
  title: string;
  body: string;
  icon: 'eye-outline' | 'create-outline' | 'apps-outline' | 'albums-outline' | 'pie-chart-outline';
  /** Corner radius of the spotlight, matching the thing it rings. */
  radius: number;
}

export interface MyProfileTourContext {
  /** Before go-live, tapping the logo says "Not live yet" instead of opening
   *  the page, so the step says when it starts working. */
  isLive: boolean;
  /** The QR button only shows once the profile has an id. */
  hasQrButton: boolean;
}

export function myProfileTourSteps({ isLive, hasQrButton }: MyProfileTourContext): MyProfileTourStep[] {
  return [
    {
      key: 'logo',
      title: 'See what clients see',
      body: isLive
        ? 'Tap your logo to see your page the way clients see it.'
        : 'Once you’re live, tap your logo to see your page the way clients see it.',
      icon: 'eye-outline',
      radius: 999,
    },
    {
      key: 'edit',
      title: 'Edit your page',
      body: 'Change your name, your description and the other details clients read about you.',
      icon: 'create-outline',
      radius: 999,
    },
    {
      key: 'shortcuts',
      title: 'Shortcuts',
      body: hasQrButton
        ? 'Set your hours, change your colours and fonts, or show a client your QR code.'
        : 'Set your hours, or change your colours and fonts.',
      icon: 'apps-outline',
      radius: 999,
    },
    {
      key: 'tabs',
      title: 'Dashboard and Services',
      body: 'Dashboard shows how your page is doing. Services is your price list: add a service, or swipe one left to hide it from clients.',
      icon: 'albums-outline',
      radius: 999,
    },
    {
      key: 'status',
      title: 'How close you are',
      body: 'The ring shows how close you are to going live. Tap View details to see what’s left.',
      icon: 'pie-chart-outline',
      radius: 26,
    },
  ];
}
