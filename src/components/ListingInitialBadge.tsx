import React, { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { listingInitial } from '../features/providers/directoryListings';

// Stands in for a logo on a directory listing that has none (product owner,
// 2026-10-19: "an initial for the logo for now in a grey background"). The
// caller sizes and rounds it through `style`, the same box an <Image> logo
// would fill there.
const GREY = {
  light: { fill: '#DCDCDE', letter: '#8E8E93' },
  dark: { fill: '#3A3A3C', letter: '#A1A1A6' },
};

interface Props {
  name: string;
  dark: boolean;
  fontSize: number;
  style?: StyleProp<ViewStyle>;
}

export const ListingInitialBadge = memo<Props>(({ name, dark, fontSize, style }) => {
  const tone = dark ? GREY.dark : GREY.light;
  return (
    <View
      style={[styles.box, { backgroundColor: tone.fill }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name} logo`}
    >
      <Text style={[styles.letter, { color: tone.letter, fontSize }]}>{listingInitial(name)}</Text>
    </View>
  );
});
ListingInitialBadge.displayName = 'ListingInitialBadge';

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    fontFamily: 'BakbakOne-Regular',
  },
});
