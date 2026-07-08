// Type shim for react-native-reanimated (package not installed — legacy components only)
declare module 'react-native-reanimated' {
  const Animated: any;
  export default Animated;
  export const useAnimatedStyle: any;
  export const withSpring: any;
  export const withTiming: any;
  export const interpolate: any;
  export const Extrapolate: any;
  export const useSharedValue: any;
  export const runOnJS: any;
}
