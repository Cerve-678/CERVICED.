import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { Animated } from 'react-native';

interface TabIconProps {
  name: string;
  size?: number;
  color?: string;
  focused?: boolean;
}

// Comprehensive icon paths for all app needs
const iconPaths = {
  'chat-dots': {
    bubble: 'M12 20.4c5.3 0 9.6-4.1 9.6-9.6S17.3 1.2 12 1.2 2.4 5.3 2.4 10.8c0 2.0.7 3.9 1.9 5.4L2.5 20.3c-.2.3-.1.8.2 1 .3.3.7.4 1 .2l4.4-2c1.2.5 2.5.8 3.9.8z',
    dots: [
      { cx: 7.8, cy: 10.8, r: 1.3 },
      { cx: 12, cy: 10.8, r: 1.3 },
      { cx: 16.2, cy: 10.8, r: 1.3 }
    ]
  },
  'earth': 'M4.5 9.9l1.2 1.2c.2.2.5.4.8.4h.8c.3 0 .6.1.8.4l1.1 1.1c.2.2.4.5.4.8v1.4c0 .3.1.6.4.8l.5.5c.2.2.4.5.4.8v.7c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2v-.1c0-.3.1-.6.4-.8l1.7-1.7c.2-.2.4-.5.4-.8v-1.3c0-.7-.5-1.2-1.2-1.2h-3.1c-.3 0-.6-.1-.8-.4l-.6-.6c-.2-.2-.3-.4-.3-.7 0-.5.4-.9.9-.9h1.3c.5 0 .9-.4.9-.9 0-.2-.1-.4-.3-.6l-.7-.7c-.1-.1-.2-.3-.2-.5 0-.2.1-.4.2-.5l.6-.6c.2-.2.4-.5.4-.8 0-.3-.1-.5-.3-.7-.1 0-.2 0-.3 0-3.6 0-6.6 2.4-7.5 5.7zm15.3 2.1c0-1.3-.3-2.5-.9-3.6-.2 0-.5.1-.7.3l-.5.5c-.2.2-.4.5-.4.8v1.3c0 .7.5 1.2 1.2 1.2h.9c.1 0 .2 0 .3 0 .1-.2.1-.3.1-.5zM2.4 12c0-5.3 4.3-9.6 9.6-9.6s9.6 4.3 9.6 9.6-4.3 9.6-9.6 9.6S2.4 17.3 2.4 12z',
  'house': 'M12.8 2.7c-.5-.4-1.1-.4-1.6 0L2.8 10.5c-.4.3-.5.9-.3 1.3.2.4.6.7 1.1.7h.6v6.6c0 1.3 1.1 2.4 2.4 2.4h10.8c1.3 0 2.4-1.1 2.4-2.4V12.5h.6c.5 0 .9-.3 1.1-.7.2-.4.1-.9-.3-1.3L12.8 2.7zm-1.4 11.7h1.2c1 0 1.8.8 1.8 1.8v3.6H9.6v-3.6c0-1 .8-1.8 1.8-1.8z',
  'basket-shopping': {
    basket: 'M12 2.4c.2 0 .5.1.6.3l5.4 5.7h2.9c.7 0 1.2.5 1.2 1.2 0 .5-.3 1-.8 1.1l-1.7 7.8c-.2 1.1-1.2 1.9-2.3 1.9H6.7c-1.1 0-2.1-.8-2.3-1.9L2.7 10.7c-.5-.1-.8-.6-.8-1.1 0-.7.5-1.2 1.2-1.2h2.9l5.4-5.7c.1-.2.4-.3.6-.3zm0 2.2L8.4 8.4h7.2L12 4.6z',
    lines: [
      'M8.5 12.2v4.6c0 .4.3.8.8.8s.8-.4.8-.8v-4.6c0-.4-.3-.8-.8-.8s-.8.4-.8.8z',
      'M11.2 12.2v4.6c0 .4.3.8.8.8s.8-.4.8-.8v-4.6c0-.4-.3-.8-.8-.8s-.8.4-.8.8z',
      'M13.9 12.2v4.6c0 .4.3.8.8.8s.8-.4.8-.8v-4.6c0-.4-.3-.8-.8-.8s-.8.4-.8.8z'
    ]
  },
  'user': 'M12 11.7c2.5 0 4.5-2 4.5-4.5S14.5 2.7 12 2.7 7.5 4.7 7.5 7.2s2 4.5 4.5 4.5zm-1.1 2.1c-3.7 0-6.7 3-6.7 6.7 0 .6.5 1.1 1.1 1.1h13.4c.6 0 1.1-.5 1.1-1.1 0-3.7-3-6.7-6.7-6.7h-2.2z',
  // NEW ICONS FOR EXPLORESCREEN
  'heart': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  'bookmark': 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z',
  'share': 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8m-8-8l4 4-4 4m4-4H4',
  'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  // Additional social media style icons
  'message': 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  'search': 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
  'bell': 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9zm-5 13a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2z',
  'plus': 'M12 5v14m-7-7h14',
  'x': 'M18 6L6 18M6 6l12 12',
  'check': 'M20 6L9 17l-5-5',
  'sliders': 'M3.6 4.8C3.1 4.8 2.4 5.3 2.4 6C2.4 6.7 3.1 7.2 3.6 7.2L6.9 7.2C7.3 8.3 8.4 9 9.6 9C10.8 9 11.9 8.3 12.3 7.2L20.4 7.2C20.9 7.2 21.6 6.7 21.6 6C21.6 5.3 20.9 4.8 20.4 4.8L12.3 4.8C11.9 3.7 10.8 3 9.6 3C8.4 3 7.3 3.7 6.9 4.8L3.6 4.8zM3.6 10.8C3.1 10.8 2.4 11.3 2.4 12C2.4 12.7 3.1 13.2 3.6 13.2L12.9 13.2C13.3 14.3 14.4 15 15.6 15C16.8 15 17.9 14.3 18.3 13.2L20.4 13.2C20.9 13.2 21.6 12.7 21.6 12C21.6 11.3 20.9 10.8 20.4 10.8L18.3 10.8C17.9 9.7 16.8 9 15.6 9C14.4 9 13.3 9.7 12.9 10.8L3.6 10.8zM3.6 16.8C3.1 16.8 2.4 17.3 2.4 18C2.4 18.7 3.1 19.2 3.6 19.2L5.7 19.2C6.1 20.3 7.2 21 8.4 21C9.6 21 10.7 20.3 11.1 19.2L20.4 19.2C20.9 19.2 21.6 18.7 21.6 18C21.6 17.3 20.9 16.8 20.4 16.8L11.1 16.8C10.7 15.7 9.6 15 8.4 15C7.2 15 6.1 15.7 5.7 16.8L3.6 16.8z',
  'magnifying-glass': 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
  'calendar-today': 'M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z',
  'grid-layout': 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z',
};

export default function TabIcon({ 
  name, 
  size = 28,
  color = '#000000',
  focused = false 
}: TabIconProps) {
  const animatedScale = React.useRef(new Animated.Value(1)).current;
  const iconSize = focused ? size + 2 : size;
  const iconColor = color || '#000000';
  // Detail color is the inverse — dark detail on white icons, white detail on dark icons
  const isLightIcon = iconColor === '#FFFFFF' || iconColor === '#fff' || iconColor === '#ffffff';
  const detailColor = isLightIcon ? '#1C1C1E' : '#FFFFFF';
  
  React.useEffect(() => {
    Animated.spring(animatedScale, {
      toValue: focused ? 1.08 : 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  }, [focused]);

  const renderIcon = () => {
    switch (name) {
      case 'chat-dots':
        const chatData = iconPaths['chat-dots'] as { bubble: string; dots: Array<{cx: number, cy: number, r: number}> };
        return (
          <>
            <Path d={chatData.bubble} fill={iconColor} fillRule="evenodd" />
            {chatData.dots.map((dot, index) => (
              <Circle
                key={index}
                cx={dot.cx}
                cy={dot.cy}
                r={dot.r}
                fill={detailColor}
                stroke={iconColor}
                strokeWidth="0.2"
              />
            ))}
          </>
        );
      
      case 'basket-shopping':
        const basketData = iconPaths['basket-shopping'] as { basket: string; lines: string[] };
        return (
          <>
            <Path d={basketData.basket} fill={iconColor} fillRule="evenodd" />
            {basketData.lines.map((line, index) => (
              <Path
                key={index}
                d={line}
                fill={detailColor}
                stroke={iconColor}
                strokeWidth="0.1"
              />
            ))}
          </>
        );
      
      default:
        const pathData = iconPaths[name as keyof typeof iconPaths];
        if (typeof pathData === 'string') {
          return <Path d={pathData} fill={iconColor} fillRule="evenodd" />;
        }
        return null;
    }
  };

  return (
    <Animated.View style={{ transform: [{ scale: animatedScale }] }}>
      <Svg 
        width={iconSize} 
        height={iconSize} 
        viewBox="0 0 24 24" 
        fill="none"
      >
        {renderIcon()}
      </Svg>
    </Animated.View>
  );
}