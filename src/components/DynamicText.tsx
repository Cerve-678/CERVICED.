import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useDynamicTranslation } from '../i18n/useDynamicTranslation';

export interface DynamicTextProps extends TextProps {
  /** Provider-WRITTEN source text (authored in English). Rendered as-is unless
   *  live dynamic translation is enabled AND a non-English language is active. */
  text: string;
}

/**
 * Drop-in `<Text>` for provider-WRITTEN content (bios, service names, notes)
 * that translates live via translateDynamic when the feature is on, and shows
 * the original otherwise. Accepts all the usual Text props (style, numberOfLines
 * …) so it can replace a plain `<Text>{provider.bio}</Text>` one-for-one.
 *
 * Do NOT use this for legal or health-safety copy: that is app-authored UI
 * copy held in English via the static i18n do-not-translate guard, never sent
 * to a paid translation API.
 */
export function DynamicText({ text, ...rest }: DynamicTextProps) {
  const display = useDynamicTranslation(text);
  return <Text {...rest}>{display}</Text>;
}

export default DynamicText;
