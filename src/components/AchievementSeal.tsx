import React from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

const RING_RADIUS = 31;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

interface AchievementSealProps {
  size: number;
  iconPath: string;
  earned: boolean;
  /** 0 to 1, how much of the progress ring to fill while it isn't earned yet. */
  share: number;
  accent: string;
  /** Colour drawn on the solid seal. */
  ink: string;
  /** Colour of the icon on a seal that isn't earned yet. */
  mutedIcon: string;
  ringTrack: string;
}

/** The Fully Booked certificate's seal when earned, an open progress ring before that. */
function AchievementSeal({ size, iconPath, earned, share, accent, ink, mutedIcon, ringTrack }: AchievementSealProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 84 84">
      {earned ? (
        <>
          <Circle cx={42} cy={42} r={38} fill="none" stroke={accent} strokeWidth={5} strokeDasharray="1 7.95" strokeLinecap="round" />
          <Circle cx={42} cy={42} r={RING_RADIUS} fill={accent} />
          <Circle cx={42} cy={42} r={26} fill="none" stroke={ink} strokeWidth={1} />
        </>
      ) : (
        <>
          <Circle cx={42} cy={42} r={RING_RADIUS} fill="none" stroke={ringTrack} strokeWidth={4} />
          {share > 0 && (
            <Circle
              cx={42}
              cy={42}
              r={RING_RADIUS}
              fill="none"
              stroke={accent}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${RING_LENGTH * share} ${RING_LENGTH}`}
              transform="rotate(-90 42 42)"
            />
          )}
        </>
      )}
      <G transform="translate(27 27) scale(1.25)">
        <Path d={iconPath} fill="none" stroke={earned ? ink : mutedIcon} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

export default React.memo(AchievementSeal);
