// Web: react-native-keyboard-controller has no web support.
// Fall back to a plain ScrollView which behaves correctly on web.
import React from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';

export function KeyboardScrollView(props: ScrollViewProps) {
  // Remove native-only prop 'bottomOffset' if passed
  const { ...rest } = props as ScrollViewProps & { bottomOffset?: number };
  delete (rest as any).bottomOffset;
  return <ScrollView {...rest} />;
}
