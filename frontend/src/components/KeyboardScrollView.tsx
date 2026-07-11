// Native: uses react-native-keyboard-controller for smooth keyboard avoidance.
// Metro auto-picks KeyboardScrollView.web.tsx on web platform.
// The native module isn't linked in Expo Go, so requiring it throws at
// import time there — fall back to a plain ScrollView in that case.
import React from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';

let KeyboardScrollViewImpl: React.ComponentType<ScrollViewProps & { bottomOffset?: number }>;
function FallbackKeyboardScrollView({ bottomOffset: _bottomOffset, ...rest }: ScrollViewProps & { bottomOffset?: number }) {
  return <ScrollView {...rest} />;
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  KeyboardScrollViewImpl = require('react-native-keyboard-controller').KeyboardAwareScrollView;
} catch {
  KeyboardScrollViewImpl = FallbackKeyboardScrollView;
}

export const KeyboardScrollView = KeyboardScrollViewImpl;
