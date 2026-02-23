// src/components/IconLibrary.tsx
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const iconPaths = {
  // Existing icons from your provided iconPaths
  'chat-dots': 'M12 20.4c5.3 0 9.6-4.1 9.6-9.6S17.3 1.2 12 1.2 2.4 5.3 2.4 10.8c0 2.0.7 3.9 1.9 5.4L2.5 20.3c-.2.3-.1.8.2 1 .3.3.7.4 1 .2l4.4-2c1.2.5 2.5.8 3.9.8zM7.2 9.6c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2zm4.8 0c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2.5-1.2 1.2-1.2zm4.8 1.2c0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2-.5 1.2-1.2 1.2-1.2-.5-1.2-1.2z',
  'earth': 'M4.5 9.9l1.2 1.2c.2.2.5.4.8.4h.8c.3 0 .6.1.8.4l1.1 1.1c.2.2.4.5.4.8v1.4c0 .3.1.6.4.8l.5.5c.2.2.4.5.4.8v.7c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2v-.1c0-.3.1-.6.4-.8l1.7-1.7c.2-.2.4-.5.4-.8v-1.3c0-.7-.5-1.2-1.2-1.2h-3.1c-.3 0-.6-.1-.8-.4l-.6-.6c-.2-.2-.3-.4-.3-.7 0-.5.4-.9.9-.9h1.3c.5 0 .9-.4.9-.9 0-.2-.1-.4-.3-.6l-.7-.7c-.1-.1-.2-.3-.2-.5 0-.2.1-.4.2-.5l.6-.6c.2-.2.4-.5.4-.8 0-.3-.1-.5-.3-.7-.1 0-.2 0-.3 0-3.6 0-6.6 2.4-7.5 5.7zm15.3 2.1c0-1.3-.3-2.5-.9-3.6-.2 0-.5.1-.7.3l-.5.5c-.2.2-.4.5-.4.8v1.3c0 .7.5 1.2 1.2 1.2h.9c.1 0 .2 0 .3 0 .1-.2.1-.3.1-.5zM2.4 12c0-5.3 4.3-9.6 9.6-9.6s9.6 4.3 9.6 9.6-4.3 9.6-9.6 9.6S2.4 17.3 2.4 12z',
  'house': 'M12.8 2.7c-.5-.4-1.1-.4-1.6 0L2.8 10.5c-.4.3-.5.9-.3 1.3.2.4.6.7 1.1.7h.6v6.6c0 1.3 1.1 2.4 2.4 2.4h10.8c1.3 0 2.4-1.1 2.4-2.4V12.5h.6c.5 0 .9-.3 1.1-.7.2-.4.1-.9-.3-1.3L12.8 2.7zm-1.4 11.7h1.2c1 0 1.8.8 1.8 1.8v3.6H9.6v-3.6c0-1 .8-1.8 1.8-1.8z',
  'basket-shopping': 'M12 2.4c.2 0 .5.1.6.3l5.4 5.7h2.9c.7 0 1.2.5 1.2 1.2 0 .5-.3 1-.8 1.1l-1.7 7.8c-.2 1.1-1.2 1.9-2.3 1.9H6.7c-1.1 0-2.1-.8-2.3-1.9L2.7 10.7c-.5-.1-.8-.6-.8-1.1 0-.7.5-1.2 1.2-1.2h2.9l5.4-5.7c.1-.2.4-.3.6-.3zm0 2.2L8.4 8.4h7.2L12 4.6zM9 12.3c0-.5-.4-.9-.9-.9s-.9.4-.9.9v4.2c0 .5.4.9.9.9s.9-.4.9-.9v-4.2zm3 0c0-.5-.4-.9-.9-.9s-.9.4-.9.9v4.2c0 .5.4.9.9.9s.9-.4.9-.9v-4.2zm3 .9c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9v4.2c0 .5-.4.9-.9.9s-.9-.4-.9-.9v-4.2z',
  'user': 'M12 11.7c2.5 0 4.5-2 4.5-4.5S14.5 2.7 12 2.7 7.5 4.7 7.5 7.2s2 4.5 4.5 4.5zm-1.1 2.1c-3.7 0-6.7 3-6.7 6.7 0 .6.5 1.1 1.1 1.1h13.4c.6 0 1.1-.5 1.1-1.1 0-3.7-3-6.7-6.7-6.7h-2.2z',
  'bell': 'M12 2.4c-.7 0-1.2.5-1.2 1.2v.1c-2.7.6-4.8 2.9-4.8 5.7v.8c0 1.8-.6 3.6-1.7 5.0l-.4.5c-.2.2-.3.5-.3.8 0 .7.6 1.3 1.3 1.3h14.2c.7 0 1.3-.6 1.3-1.3 0-.3-.1-.6-.3-.8l-.4-.5c-1.1-1.4-1.7-3.2-1.7-5.0v-.8c0-2.8-2.1-5.1-4.8-5.7v-.1c0-.7-.5-1.2-1.2-1.2zm-2.3 17.4c.3 1.0 1.2 1.8 2.3 1.8s2-.8 2.3-1.8H9.7z',
  'bars': 'M3.6 6c0-.7.5-1.2 1.2-1.2h14.4c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2H4.8c-.7 0-1.2-.5-1.2-1.2zm0 6c0-.7.5-1.2 1.2-1.2h14.4c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2H4.8c-.7 0-1.2-.5-1.2-1.2zm1.2 4.8c-.7 0-1.2.5-1.2 1.2s.5 1.2 1.2 1.2h14.4c.7 0 1.2-.5 1.2-1.2s-.5-1.2-1.2-1.2H4.8z',
  'share': 'M13.9 3.1c-.5.2-.8.7-.8 1.2v3h-4.2c-3.7 0-6.7 3-6.7 6.7 0 4.2 3.1 6.3 3.9 6.8.1.1.3.1.4.1.4 0 .7-.3.7-.7 0-.3-.2-.6-.4-.8-.4-.3-1.3-1.1-1.3-2.7 0-2 1.6-3.6 3.6-3.6h4.2v3c0 .5.3 1 .8 1.2.5.2 1.1.1 1.4-.2l6-6c.5-.5.5-1.2 0-1.7l-6-6c-.3-.3-.9-.4-1.4-.2z',
  'star': 'M12.8 1.7c-.2-.3-.5-.5-.8-.5s-.6.2-.8.5L8.4 7.1 1.4 8.1c-.3.1-.6.3-.7.6-.1.3 0 .7.2.9l5.5 5.4L5.3 20.6c-.1.3 0 .7.3.9.3.2.6.2.9.1L12 19.4l5.5 2.9c.3.2.6.1.9-.1.3-.2.4-.6.3-.9L17.7 15l5.5-5.4c.2-.2.3-.6.2-.9-.1-.3-.4-.5-.7-.6l-7-1L12.8 1.7z',
  'magnifying-glass': 'M18 10.2c0 1.7-.5 3.3-1.5 4.6l4.7 4.7c.5.5.5 1.2 0 1.7s-1.2.5-1.7 0L14.8 16.5c-1.3 1-2.9 1.5-4.6 1.5-4.3 0-7.8-3.5-7.8-7.8S5.9 2.4 10.2 2.4s7.8 3.5 7.8 7.8zm-7.8 5.4c3 0 5.4-2.4 5.4-5.4s-2.4-5.4-5.4-5.4-5.4 2.4-5.4 5.4 2.4 5.4 5.4 5.4z',
  'sliders': 'M3.6 4.8c-.7 0-1.2.5-1.2 1.2s.5 1.2 1.2 1.2h3.3c.5 1.1 1.6 1.8 2.9 1.8s2.4-.7 2.9-1.8h8.7c.7 0 1.2-.5 1.2-1.2s-.5-1.2-1.2-1.2h-8.7c-.5-1.1-1.6-1.8-2.9-1.8s-2.4.7-2.9 1.8H3.6zm0 6c-.7 0-1.2.5-1.2 1.2s.5 1.2 1.2 1.2h9.3c.5 1.1 1.6 1.8 2.9 1.8s2.4-.7 2.9-1.8h2.7c.7 0 1.2-.5 1.2-1.2s-.5-1.2-1.2-1.2h-2.7c-.5-1.1-1.6-1.8-2.9-1.8s-2.4.7-2.9 1.8H3.6zm0 6c-.7 0-1.2.5-1.2 1.2s.5 1.2 1.2 1.2h2.1c.5 1.1 1.6 1.8 2.9 1.8s2.4-.7 2.9-1.8h8.7c.7 0 1.2-.5 1.2-1.2s-.5-1.2-1.2-1.2h-8.7c-.5-1.1-1.6-1.8-2.9-1.8s-2.4.7-2.9 1.8H3.6z',
  'heart': 'M11.4 5.7L12 6.4l.6-.7c.9-1.3 2.4-2.1 4.1-2.1 2.8 0 5 2.2 5 5v.1c0 4.2-5.3 9.2-8.1 11.2-.5.4-1.1.6-1.6.6s-1.1-.2-1.6-.6C7.3 18 2 13 2 8.7v-.1c0-2.8 2.2-5 5-5 1.7 0 3.2.8 4.4 2.1z',
  'bookmark': 'M7.2 2.4c-1.3 0-2.4 1.1-2.4 2.4v18c0 .4.2.8.5 1 .3.2.7.2 1.2-.1L12 19.6l5.5 4.1c.5.4.9.3 1.2.1.3-.2.5-.6.5-1v-18c0-1.3-1.1-2.4-2.4-2.4H7.2z',
  // Added icons for UserProfileScreen
  'brightness-6': 'M12 3c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1s1-.45 1-1V4c0-.55-.45-1-1-1zm-4.24 2.76c-.39-.39-1.02-.39-1.41 0s-.39 1.02 0 1.41l2.83 2.83c.39.39 1.02.39 1.41 0s.39-1.02 0-1.41L8.76 5.76zm8.48 0c.39-.39.39-1.02 0-1.41s-1.02-.39-1.41 0L13.24 7.59c-.39.39-.39 1.02 0 1.41s1.02.39 1.41 0l2.83-2.83zM12 15c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1s1-.45 1-1v-4c0-.55-.45-1-1-1zm-7.24-.76c-.39-.39-1.02-.39-1.41 0s-.39 1.02 0 1.41l2.83 2.83c.39.39 1.02.39 1.41 0s.39-1.02 0-1.41L4.76 14.24zm12.48 0c-.39-.39-1.02-.39-1.41 0s-.39 1.02 0 1.41l2.83 2.83c.39.39 1.02.39 1.41 0s.39-1.02 0-1.41l-2.83-2.83z',
  'format-size': 'M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7H3v-7zm4 9h3v-7H7v7z',
  'contrast': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6V6z',
  'language': 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z',
  'help': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z',
  'info': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  'gavel': 'M1 21h12v2H1v-2zM5.24 8.07l2.83 2.83 2.83-2.83-2.83-2.83L5.24 8.07zm4.95 5.66l2.83 2.83 8.49-8.49-2.83-2.83-8.49 8.49zM13.31 10.9l-2.83-2.83 2.83-2.83 2.83 2.83-2.83 2.83zM3.41 2.59L2 4l6.36 6.36 1.41-1.41L3.41 2.59z',
  'copyright': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-12.5c-2.49 0-4.5 2.01-4.5 4.5s2.01 4.5 4.5 4.5 4.5-2.01 4.5-4.5-2.01-4.5-4.5-4.5zm0 7c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  'bug-report': 'M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z',
  // Additional icons needed for UserProfileScreen
  'calendar-today': 'M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V8h16v13z',
  'email': 'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  'phone': 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  'payment': 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  'receipt': 'M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20z',
  'security': 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
  'devices': 'M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z',
  'settings-applications': 'M12 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm7-7H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-1.75 9c0 .23-.02.46-.05.68l1.48 1.06c.13.09.16.25.07.39l-1.41 2.45c-.09.15-.31.19-.46.1l-1.88-.76c-.36.27-.76.48-1.19.63l-.28 2.01c-.03.18-.18.32-.35.32h-2.82c-.18 0-.33-.14-.35-.32l-.28-2.01c-.43-.15-.83-.36-1.19-.63l-1.88.76c-.15.09-.37.05-.46-.1l-1.41-2.45c-.09-.14-.06-.3.07-.39l1.48-1.06c-.03-.22-.05-.45-.05-.68s.02-.46.05-.68l-1.48-1.06c-.13-.09-.16-.25-.07-.39l1.41-2.45c.09-.15.31-.19.46-.1l1.88.76c.36-.27.76-.48 1.19-.63l.28-2.01c.03-.18.18-.32.35-.32h2.82c.18 0 .33.14.35.32l.28 2.01c.43.15.83.36 1.19.63l1.88-.76c.15-.09.37-.05.46.1l1.41 2.45c.09.14.06.3-.07.39l-1.48 1.06c.03.22.05.45.05.68z',
  'privacy-tip': 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z',
  'notifications': 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z',
  'message': 'M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z',
  'auto-awesome': 'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z',
  'experiment': 'M9 3.8L5.8 7 2 3.2v17.6c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V3.2L18.2 7 15 3.8 12 7l-3-3.2zM12 16c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  'logout': 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  'storefront': 'M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z',
  'grid-layout': 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z',
  'chevron-right': 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z',
};

export default function Icon({ name, size = 24, color = '#666', style }: IconProps) {
  const pathData = iconPaths[name as keyof typeof iconPaths];

  if (!pathData) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
    >
      <Path
        d={pathData}
        fill={color}
        stroke={color}
        strokeWidth="0.5"
      />
    </Svg>
  );
}

export const ChatDotsIcon = (props: Omit<IconProps, 'name'>) => <Icon name="chat-dots" {...props} />;
export const EarthIcon = (props: Omit<IconProps, 'name'>) => <Icon name="earth" {...props} />;
export const HouseIcon = (props: Omit<IconProps, 'name'>) => <Icon name="house" {...props} />;
export const BasketIcon = (props: Omit<IconProps, 'name'>) => <Icon name="basket-shopping" {...props} />;
export const UserIcon = (props: Omit<IconProps, 'name'>) => <Icon name="user" {...props} />;
export const BellIcon = (props: Omit<IconProps, 'name'>) => <Icon name="bell" {...props} />;
export const BarsIcon = (props: Omit<IconProps, 'name'>) => <Icon name="bars" {...props} />;
export const ShareIcon = (props: Omit<IconProps, 'name'>) => <Icon name="share" {...props} />;
export const StarIcon = (props: Omit<IconProps, 'name'>) => <Icon name="star" {...props} />;
export const SearchIcon = (props: Omit<IconProps, 'name'>) => <Icon name="magnifying-glass" {...props} />;
export const SlidersIcon = (props: Omit<IconProps, 'name'>) => <Icon name="sliders" {...props} />;
export const HeartIcon = (props: Omit<IconProps, 'name'>) => <Icon name="heart" {...props} />;
export const BookmarkIcon = (props: Omit<IconProps, 'name'>) => <Icon name="bookmark" {...props} />;
export const Brightness6Icon = (props: Omit<IconProps, 'name'>) => <Icon name="brightness-6" {...props} />;
export const FormatSizeIcon = (props: Omit<IconProps, 'name'>) => <Icon name="format-size" {...props} />;
export const ContrastIcon = (props: Omit<IconProps, 'name'>) => <Icon name="contrast" {...props} />;
export const LanguageIcon = (props: Omit<IconProps, 'name'>) => <Icon name="language" {...props} />;
export const HelpIcon = (props: Omit<IconProps, 'name'>) => <Icon name="help" {...props} />;
export const InfoIcon = (props: Omit<IconProps, 'name'>) => <Icon name="info" {...props} />;
export const GavelIcon = (props: Omit<IconProps, 'name'>) => <Icon name="gavel" {...props} />;
export const CopyrightIcon = (props: Omit<IconProps, 'name'>) => <Icon name="copyright" {...props} />;
export const BugReportIcon = (props: Omit<IconProps, 'name'>) => <Icon name="bug-report" {...props} />;
export const CalendarIcon = (props: Omit<IconProps, 'name'>) => <Icon name="calendar-today" {...props} />;
export const EmailIcon = (props: Omit<IconProps, 'name'>) => <Icon name="email" {...props} />;
export const PhoneIcon = (props: Omit<IconProps, 'name'>) => <Icon name="phone" {...props} />;
export const PaymentIcon = (props: Omit<IconProps, 'name'>) => <Icon name="payment" {...props} />;
export const ReceiptIcon = (props: Omit<IconProps, 'name'>) => <Icon name="receipt" {...props} />;
export const SecurityIcon = (props: Omit<IconProps, 'name'>) => <Icon name="security" {...props} />;
export const DevicesIcon = (props: Omit<IconProps, 'name'>) => <Icon name="devices" {...props} />;
export const SettingsApplicationsIcon = (props: Omit<IconProps, 'name'>) => <Icon name="settings-applications" {...props} />;
export const PrivacyTipIcon = (props: Omit<IconProps, 'name'>) => <Icon name="privacy-tip" {...props} />;
export const NotificationsIcon = (props: Omit<IconProps, 'name'>) => <Icon name="notifications" {...props} />;
export const MessageIcon = (props: Omit<IconProps, 'name'>) => <Icon name="message" {...props} />;
export const AutoAwesomeIcon = (props: Omit<IconProps, 'name'>) => <Icon name="auto-awesome" {...props} />;
export const ExperimentIcon = (props: Omit<IconProps, 'name'>) => <Icon name="experiment" {...props} />;
export const LogoutIcon = (props: Omit<IconProps, 'name'>) => <Icon name="logout" {...props} />;
export const GridLayoutIcon = (props: Omit<IconProps, 'name'>) => <Icon name="grid-layout" {...props} />;