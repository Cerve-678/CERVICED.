// The client BookingDetail screen's static header options, shared by every
// client stack that registers it. BookingDetailScreen still sets its colours
// and the ⋯ button in setOptions, but those only land after the first frame,
// so anything visible on that frame has to be set here: without it the push
// briefly shows the previous screen's name beside the back arrow and the route
// name as the title.
export const BOOKING_DETAIL_OPTIONS = {
  headerShown: true,
  presentation: 'card',
  headerTitle: '',
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
} as const;
