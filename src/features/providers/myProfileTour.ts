
import { tr } from '../../i18n/translate';/**
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
      title: tr('discover.page.seeWhatClientsSee'),
      body: isLive
        ? 'Tap your logo to see your page the way clients see it.'
        : 'Once you’re live, tap your logo to see your page the way clients see it.',
      icon: 'eye-outline',
      radius: 999,
    },
    {
      key: 'edit',
      title: tr('discover.page.editYourPage'),
      body: tr('discover.page.addYourBusinessNameAndDescription'),
      icon: 'create-outline',
      radius: 999,
    },
    {
      key: 'shortcuts',
      title: tr('discover.page.shortcuts'),
      body: hasQrButton
        ? 'Set your hours, change your colours and fonts, or show a client your QR code.'
        : 'Set your hours, or change your colours and fonts.',
      icon: 'apps-outline',
      radius: 999,
    },
    {
      key: 'tabs',
      title: tr('discover.page.dashboardAndServices'),
      body: tr('discover.page.dashboardShowsHowYourPageIs'),
      icon: 'albums-outline',
      radius: 999,
    },
    {
      key: 'status',
      title: tr('discover.page.howCloseYouAre'),
      body: tr('discover.page.theRingShowsHowCloseYou'),
      icon: 'pie-chart-outline',
      radius: 26,
    },
  ];
}
