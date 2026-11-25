/**
 * A plain one-message page in the website's own look: the CERVICED wordmark,
 * a line and a way back to the home page. Used while a provider's web page
 * isn't built yet, and for an address the site doesn't have.
 *
 * Colours are the site's provider-hat palette (waitlist/README.md), and it
 * follows the site's light/dark switch: the visitor's saved choice
 * (`cerviced-theme`, written by the static pages' header toggle), else the
 * device setting. A provider's own page never does this: it keeps the
 * provider's colours whatever the viewer's mode.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

const LIGHT = { bg: '#F5F1EC', text: '#5C4033', sub: '#8A7466', button: '#5C4033', onButton: '#FFFFFF' };
const DARK = { bg: '#1A1815', text: '#F5F1EC', sub: '#B5A9A0', button: '#AF9197', onButton: '#FFFFFF' };

function savedSiteTheme(): 'light' | 'dark' | null {
  try {
    const value = window.localStorage.getItem('cerviced-theme');
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function SiteMessagePage({ title, body }: { title: string; body: string }) {
  const deviceScheme = useColorScheme();
  const colours = useMemo(() => {
    const mode = savedSiteTheme() ?? (deviceScheme === 'dark' ? 'dark' : 'light');
    return mode === 'dark' ? DARK : LIGHT;
  }, [deviceScheme]);

  return (
    <View style={[styles.root, { backgroundColor: colours.bg }]}>
      <Text style={[styles.wordmark, { color: colours.text }]}>CERVICED</Text>
      <Text style={[styles.title, { color: colours.text }]} accessibilityRole="header">{title}</Text>
      <Text style={[styles.body, { color: colours.sub }]}>{body}</Text>
      <TouchableOpacity
        accessibilityRole="link"
        onPress={() => window.location.assign('/')}
        style={[styles.button, { backgroundColor: colours.button }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.buttonText, { color: colours.onButton }]}>Go to the home page</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  wordmark: { fontFamily: 'BakbakOne-Regular', fontSize: 22, letterSpacing: 1.76, marginBottom: 32 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 26, textAlign: 'center', marginBottom: 10 },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 420, marginBottom: 28 },
  button: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999 },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 15 },
});
