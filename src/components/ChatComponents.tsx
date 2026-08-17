import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, TextInput, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ChatMessage, ChatSuggestion } from '../services/becca/types';
import { Provider } from '../services/ProviderDataService';
import { useTheme } from '../contexts/ThemeContext';
import { formatTime12 } from '../utils/dateUtils';

// Colours come from useTheme().palette (hat-aware — client vs provider),
// not a local literal copy. accentShadow mirrors the palette's accentDim.

// ==================== MARK ====================
// Plain rounded square — the single recurring identity shape. Static
// everywhere (header, per-reply avatars); only the hero screen's mark glows
// (see AmbientMark's `glow` prop), so this component never animates itself.

interface MarkProps {
  size?: number;
}

export function Mark({ size = 22 }: MarkProps) {
  const { palette: P } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: P.accent,
      }}
    />
  );
}

// The hero-only glowing variant. Renders the same plain square plus an
// animated radial glow layer behind it — this component should only ever
// be mounted on the hero/opening screen.
interface AmbientMarkProps {
  size?: number;
}

export function AmbientMark({ size = 68 }: AmbientMarkProps) {
  const { isDarkMode, palette: P } = useTheme();
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // shadowOpacity has no native-driver support, so this stays JS-driven.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1150, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(glow, { toValue: 0, duration: 1150, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  // BlurView does a real backdrop blur — it samples and darkens whatever
  // is actually behind it on screen, not just locally within its own box.
  // Animating that up to a larger size/opacity in a loop is what made the
  // previous attempt cyclically dim the screen. A plain native shadow
  // behind the mark never samples the screen — it only ever paints, so it
  // can't darken sibling content — which is what's used here: solid nodes
  // with large accent-colored blurred shadows, breathing via shadowOpacity.
  // iOS derives the shadow's silhouette from the view's actual opaque
  // content, not its bounding box — a fully `transparent` backgroundColor
  // gives it nothing to cast from, so the shadow doesn't render at all no
  // matter how high shadowOpacity is set. Each caster's fill is the accent
  // color itself (same as its shadow color) and sits fully behind the
  // opaque `Mark` on top, so it's never visible as a shape — only its
  // shadow is. Both shadowOpacity/shadowRadius are JS-driver-only props
  // (no native-driver support), so these nodes stay off the native driver
  // rather than mixing drivers on one node.
  // Shape matches Mark's rounded-square (not a circle) — a circular glow
  // node larger than the square mark on top let its round edge peek out
  // past the mark's corners, reading as unwanted extra curvature.
  //
  // Emission is built from three concentric casters rather than one. A
  // single shadow at a single radius falls off linearly and reads as a
  // painted halo; real emissive falloff is steep near the source and long
  // in the tail. Stacking a tight/bright core, a mid bloom, and a wide
  // faint haze approximates that curve — each layer's own falloff sums
  // into a non-linear one. Radii/opacities are deliberately paired
  // (small+strong → large+weak); flattening them back toward each other
  // collapses the effect into the uniform halo this replaced.
  //
  // Two independent dials, easy to confuse:
  //   • `radius` — how far the light reaches (the size of the glow).
  //   • the `min`→`max` gap — how hard it breathes. Perceived pulse depth
  //     comes from the WIDTH of that gap, not from either endpoint, so
  //     raising both together brightens without breathing any harder.
  // The outer haze carries the widest gap on purpose: the tail moving more
  // than the core is what reads as light swelling into the space around the
  // mark, rather than the square itself blinking on and off.
  const glowColor = P.accent;
  // Light mode needs MORE opacity, not less, to read as equally strong. The
  // light accent is a dark chocolate brown (#5C4033) cast against a pale
  // background, so its shadow has very little tonal distance to work with;
  // dark mode's dusty rose against near-black has plenty. Same numbers in
  // both modes therefore look correct in dark and washed-out in light.
  const opacityBoost = isDarkMode ? 1 : 1.45;
  const LAYERS = [
    // rMin/rMax animate shadowRadius so the light physically SWELLS, not just
    // brightens. Opacity-only breathing reads as a dimmer switch; adding
    // radius travel is what makes it read as something emitting.
    { scale: 1.06, rMin: 0.40, rMax: 0.60, min: 0.58, max: 0.92 }, // hot core
    { scale: 1.10, rMin: 1.10, rMax: 1.68, min: 0.28, max: 0.62 }, // mid bloom
    { scale: 1.14, rMin: 2.30, rMax: 3.70, min: 0.10, max: 0.34 }, // outer haze
  ].map((l) => ({
    ...l,
    // Clamped: opacity >1 is invalid and would throw off the falloff curve
    // the stacked layers exist to produce.
    min: Math.min(l.min * opacityBoost, 1),
    max: Math.min(l.max * opacityBoost, 1),
  }));

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        // The shadow layers deliberately paint far outside this box (the outer
        // haze spans ~3.7x `size`). Anything that clips between here and the
        // screen root will cut the glow off mid-falloff, which reads as a hard
        // edge rather than light fading out — see heroScrollContainer.
        overflow: 'visible',
      }}
    >
      {LAYERS.map((layer) => {
        const castSize = size * layer.scale;
        return (
          <Animated.View
            key={layer.scale}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: castSize,
              height: castSize,
              borderRadius: castSize * 0.3,
              backgroundColor: glowColor,
              shadowColor: glowColor,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [size * layer.rMin, size * layer.rMax],
              }),
              shadowOpacity:
                Platform.OS === 'ios'
                  ? glow.interpolate({ inputRange: [0, 1], outputRange: [layer.min, layer.max] })
                  : 0,
              elevation: 0,
            }}
          />
        );
      })}
      {/* Android has no blurred-shadow equivalent (elevation casts a fixed
          grey, not a colored bloom), so emission is faked with stacked
          low-opacity fills instead — larger and fainter as they go out. */}
      {Platform.OS === 'android' &&
        LAYERS.map((layer, i) => (
          <Animated.View
            key={`a-${layer.scale}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: size * (1.35 + i * 0.75),
              height: size * (1.35 + i * 0.75),
              borderRadius: size * 0.3,
              backgroundColor: glowColor,
              opacity: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [layer.min * 0.42, layer.max * 0.42],
              }),
              // Android can't swell a shadow, so the fill itself scales to
              // carry the same size-change cue as iOS's shadowRadius travel.
              transform: [
                {
                  scale: glow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.06 + i * 0.04],
                  }),
                },
              ],
            }}
          />
        ))}
      {/* The square breathes too, in sync with its own light — a mark that
          sat perfectly still while the glow pulsed read as a static shape
          with an effect applied behind it, rather than one object emitting.
          Kept very small (2%) on purpose: this should be felt, not watched,
          and anything larger starts to look like a throb. Scale only — the
          fill colour stays put so it never reads as a flashing element. */}
      <Animated.View
        style={{
          transform: [
            {
              scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }),
            },
          ],
        }}
      >
        <Mark size={size} />
      </Animated.View>
    </View>
  );
}

// ==================== CHAT BUBBLE (real card containers) ====================

interface ChatBubbleProps {
  message: ChatMessage;
}

// Becca's copy uses **markers** to emphasise the thing the sentence is
// actually about — a service name, a provider, a heading. They were being
// rendered as literal asterisks because the bubble printed message.content
// straight into a <Text>. This splits on the markers and returns real bold
// spans, so the emphasis lands and the punctuation disappears.
//
// Deliberately only `**bold**`: a full markdown renderer is a dependency and
// an attack surface this doesn't need, and bold is the only marker Becca's
// capabilities actually emit (see capabilities/client.ts).
// Exported because Becca's text surfaces in more than one place — the chat
// bubbles here and the chat-history previews in BeccaScreen. Any new surface
// that renders assistant copy must go through this, or the raw ** markers
// show through exactly as they did before.
function renderInlineRichText(content: string): React.ReactNode {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <Text key={i} style={styles.bubbleBold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return part;
  });
}

/**
 * Renders Becca's lightweight response language.
 *
 * `## Heading` gives dynamic answers a clear takeaway, while `- item` turns
 * result rows into proper, easy-to-scan lists. Both remain plain text when a
 * message is saved or previewed, so chat history never depends on a renderer.
 */
export function renderRichText(content: string): React.ReactNode {
  const lines = content.split("\n");
  return lines.map((line, index) => {
    const key = `line-${index}`;
    const heading = line.match(/^##\s+(.+)$/);
    const item = line.match(/^(?:[-•])\s+(.+)$/);

    if (heading) {
      return (
        <React.Fragment key={key}>
          <Text style={styles.bubbleHeading}>{renderInlineRichText(heading[1]!)}</Text>
          {index < lines.length - 1 ? "\n" : null}
        </React.Fragment>
      );
    }

    if (item) {
      return (
        <React.Fragment key={key}>
          <Text style={styles.bubbleBullet}>• </Text>
          {renderInlineRichText(item[1]!)}
          {index < lines.length - 1 ? "\n" : null}
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={key}>
        {renderInlineRichText(line)}
        {index < lines.length - 1 ? "\n" : null}
      </React.Fragment>
    );
  });
}

/**
 * Plain-text version for places that can't host nested <Text> spans (list
 * previews, session titles, notification copy). Strips the markers instead of
 * rendering them — never leaves a raw ** on screen.
 */
export function stripRichText(content: string): string {
  return content
    .replace(/^##\s+/gm, '')
    .replace(/^[-•]\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const { palette: P } = useTheme();
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <View style={styles.row}>
        <View style={[styles.card, styles.userCard, { backgroundColor: P.accent }]}>
          {message.imageUri && (
            <Image source={{ uri: message.imageUri }} style={styles.messageImage} resizeMode="cover" fadeDuration={0} />
          )}
          <Text style={[styles.cardText, { color: P.onAccent }]}>{renderRichText(message.content)}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, styles.assistantRow]}>
      <Mark size={22} />
      <View
        style={[
          styles.card,
          styles.assistantCard,
          { backgroundColor: P.card, borderColor: P.border, shadowColor: P.accent },
        ]}
      >
        {message.imageUri && (
          <Image source={{ uri: message.imageUri }} style={styles.messageImage} resizeMode="cover" fadeDuration={0} />
        )}
        <Text style={[styles.cardText, { color: P.text }]}>{renderRichText(message.content)}</Text>
        <Text style={[styles.cardTime, { color: P.sub }]}>{formatTime12(new Date(message.timestamp))}</Text>
      </View>
    </View>
  );
}

// ==================== QUICK ACTIONS (vertical pill cards) ====================
// Two visual variants sharing the same ChatSuggestion data shape and
// component: "list" for longer navigation-style actions ("My Bookings"),
// "row" for short category-style options ("Nails", "Hair") that read better
// as a wrapped row of small chips than a stack of full-width cards.

interface SuggestionsProps {
  suggestions: ChatSuggestion[];
  onSuggestionPress: (suggestion: ChatSuggestion) => void;
  indented?: boolean;
  variant?: 'list' | 'row';
}

function ActionCard({
  suggestion,
  onPress,
}: {
  suggestion: ChatSuggestion;
  onPress: (suggestion: ChatSuggestion) => void;
}) {
  const { palette: P } = useTheme();
  const pressAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(pressAnim, { toValue: 0.97, useNativeDriver: true, tension: 300, friction: 10 }).start();
  }, [pressAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }).start();
  }, [pressAnim]);

  // Activation lives on `onPress`, never `onPressOut`. `onPressOut` fires on
  // ANY finger-lift that began on this card — including one that was really
  // the start of a scroll, or a drag that ended somewhere else entirely —
  // which is what made the hero's quick actions launch a chat nobody asked
  // for. `onPress` only fires when the touch stays on the target and the
  // parent ScrollView hasn't claimed the gesture as a scroll.
  const handlePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onPress(suggestion);
  }, [onPress, suggestion]);

  const animatedStyle = useMemo(() => ({ transform: [{ scale: pressAnim }] }), [pressAnim]);

  return (
    <TouchableOpacity
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      activeOpacity={1}
      // Deliberately unforgiving: the finger must settle before this reads as
      // intent, and a few px of travel cancels it outright. Tuned against
      // accidental launches from scroll gestures, not for snappiness.
      delayPressIn={80}
      pressRetentionOffset={{ top: 6, bottom: 6, left: 6, right: 6 }}
      hitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
    >
      <Animated.View
        style={[
          styles.actionCard,
          animatedStyle,
          { backgroundColor: P.card, borderColor: P.border },
        ]}
      >
        {suggestion.icon && (
          <Image source={suggestion.icon} style={styles.choiceIcon} resizeMode="contain" fadeDuration={0} />
        )}
        <View style={styles.actionCopy}>
          <Text style={[styles.actionText, { color: P.text }]}>{suggestion.text}</Text>
        </View>
        <View style={[styles.actionArrowWrap, { backgroundColor: P.iconBg }]}>
          <Text style={[styles.actionArrow, { color: P.accentText }]}>→</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function PillChip({
  suggestion,
  onPress,
}: {
  suggestion: ChatSuggestion;
  onPress: (suggestion: ChatSuggestion) => void;
}) {
  const { palette: P } = useTheme();
  const pressAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.spring(pressAnim, { toValue: 0.94, useNativeDriver: true, tension: 300, friction: 10 }).start();
  }, [pressAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }).start();
  }, [pressAnim]);

  // See ActionCard — activation must be `onPress`, not `onPressOut`, or a
  // scroll that happens to start on this chip counts as a tap.
  const handlePress = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    onPress(suggestion);
  }, [onPress, suggestion]);

  const animatedStyle = useMemo(() => ({ transform: [{ scale: pressAnim }] }), [pressAnim]);

  return (
    <TouchableOpacity
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      activeOpacity={1}
      delayPressIn={80}
      pressRetentionOffset={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Animated.View style={[styles.pillChip, animatedStyle, { backgroundColor: P.iconBg, borderColor: P.border }]}>
        <Text style={[styles.pillChipText, { color: P.accentText }]}>{suggestion.text}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function Suggestions({ suggestions, onSuggestionPress, indented = false, variant = 'list' }: SuggestionsProps) {
  const { palette: P } = useTheme();

  if (!suggestions || suggestions.length === 0) return null;

  // Row/chip layout is driven either by the caller's explicit `variant`
  // prop, or by the suggestions themselves being marked `display: "chip"`
  // (e.g. the browse-services category list) — whichever fires first, so
  // callers that just forward whatever suggestions the AI service returned
  // (both BeccaScreen call sites) still get the compact row automatically.
  const useRowLayout = variant === 'row' || suggestions.every((s) => s.display === 'chip');

  if (useRowLayout) {
    return (
      <View style={[styles.sectionWrap, indented && styles.sectionWrapIndented]}>
        <Text style={[styles.sectionLabel, { color: P.sub }]}>CHOOSE ONE</Text>
        <View style={styles.pillRow}>
          {suggestions.map((suggestion) => (
            <PillChip key={suggestion.id} suggestion={suggestion} onPress={onSuggestionPress} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.sectionWrap, indented && styles.sectionWrapIndented]}>
      <Text style={[styles.sectionLabel, { color: P.sub }]}>NEXT STEPS</Text>
      <View style={styles.actionsCol}>
        {suggestions.map((suggestion) => (
          <ActionCard key={suggestion.id} suggestion={suggestion} onPress={onSuggestionPress} />
        ))}
      </View>
    </View>
  );
}

// ==================== PROVIDER RECOMMENDATIONS ====================

interface ProviderRecommendationsProps {
  providers: Provider[];
  onProviderPress: (provider: Provider) => void;
  indented?: boolean;
}

export function ProviderRecommendations({ providers, onProviderPress, indented = true }: ProviderRecommendationsProps) {
  const { palette: P } = useTheme();

  if (!providers || providers.length === 0) return null;

  const handlePress = (provider: Provider) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onProviderPress(provider);
  };

  return (
    <View style={[styles.sectionWrap, indented && styles.sectionWrapIndented]}>
      <Text style={[styles.sectionLabel, { color: P.accentText }]}>RECOMMENDED</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recommendationsScroll}>
        {providers.map((provider) => (
          <TouchableOpacity
            key={provider.id}
            // Neutral shadow, not the accent. A coloured drop shadow reads as
            // a glow effect rather than depth, which is why these cards felt
            // heavy — and the mark is meant to be the only thing emitting.
            style={[styles.providerCard, { backgroundColor: P.card, borderColor: P.border, shadowColor: '#000' }]}
            onPress={() => handlePress(provider)}
            activeOpacity={0.7}
          >
            {/* providerFromDb maps `logo` to null when a provider has no
                logo_url, and <Image source={null}> renders an empty box —
                which is what made these cards look broken. Fall back to the
                provider's initial so the slot always reads as deliberate. */}
            <View style={[styles.logoContainer, { backgroundColor: P.iconBg }]}>
              {provider.logo ? (
                // `cover`, not `contain` — the image now fills the circle
                // edge-to-edge, and `contain` would letterbox any non-square
                // logo with bands of container colour inside the round crop.
                <Image source={provider.logo} style={styles.providerLogo} resizeMode="cover" fadeDuration={0} />
              ) : (
                <Text style={[styles.providerLogoFallback, { color: P.accentText }]}>
                  {provider.name?.trim().charAt(0).toUpperCase() || '?'}
                </Text>
              )}
            </View>
            <Text style={[styles.providerName, { color: P.text }]} numberOfLines={1}>
              {provider.name}
            </Text>
            <Text style={[styles.providerService, { color: P.sub }]} numberOfLines={1}>
              {provider.service}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ==================== THINKING INDICATOR ====================

export function ThinkingIndicator({ label = "Thinking it through…" }: { label?: string }) {
  const { palette: P } = useTheme();
  return (
    <View style={[styles.row, styles.assistantRow]}>
      <Mark size={22} />
      <View style={[styles.thinkingCard, { backgroundColor: P.card, borderColor: P.border, shadowColor: P.accent }]}>
        <Text style={[styles.thinkingLabel, { color: P.sub }]}>{label}</Text>
      </View>
    </View>
  );
}

// ==================== CHAT INPUT ====================

interface ChatInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onImagePick: () => void;
  placeholder?: string;
  hasImage?: boolean;
}

export function ChatInput({
  value,
  onChangeText,
  onSend,
  onImagePick,
  placeholder = 'Ask me anything...',
  hasImage = false,
}: ChatInputProps) {
  const { palette: P } = useTheme();
  const canSend = !!value.trim() || hasImage;

  const handleImagePick = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onImagePick();
  };

  const handleSend = () => {
    if (!canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onSend();
  };

  // Fixed, small bottom padding only — this bar lives inside the screen's
  // KeyboardAvoidingView, which already pushes it up by the exact keyboard
  // height. Any extra keyboard-reactive padding here double-counts that
  // shift (bar already moved up + its own padding grew too), which is what
  // made the input visibly float far above the keyboard. Floating-tab-bar
  // clearance for the keyboard-closed state is the screen's job now (applied
  // outside the keyboard-avoiding wrapper so it never gets pushed up too) —
  // see BeccaScreen's own bottomSpacer.
  return (
    <View style={[styles.inputBar, { backgroundColor: P.card, borderTopColor: P.border }]}>
      <View style={[styles.inputShell, { backgroundColor: P.surface }]}>
        <TouchableOpacity style={styles.imageButton} onPress={handleImagePick} activeOpacity={0.6}>
          <Ionicons name="add" size={22} color={P.sub} />
        </TouchableOpacity>

        <TextInput
          style={[styles.input, { color: P.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={P.sub}
          multiline
          maxLength={500}
        />

        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: canSend ? P.accent : P.card }]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
        >
          <Text style={[styles.sendButtonText, { color: canSend ? P.onAccent : P.sub }]}>↑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },

  card: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userCard: {
    borderBottomRightRadius: 5,
  },
  assistantCard: {
    borderWidth: 1,
    borderBottomLeftRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 2,
  },
  cardText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    lineHeight: 21,
    // Jura is a variable font, so weight is a real axis here rather than a
    // faux-bold synthesis — 500 gives the body a bit more presence without
    // tipping into the heading weight used by BakbakOne elsewhere.
    fontWeight: '500',
  },
  // Emphasis inside a bubble (see renderRichText). Sits clearly above the
  // body's 500 so the highlighted service/provider name actually stands out.
  bubbleBold: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
  },
  bubbleHeading: {
    // A different display face gives the answer's title a clear visual tier
    // above the body copy, so the user can scan a long thread by outcome.
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    lineHeight: 23,
    letterSpacing: 0.15,
  },
  bubbleBullet: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 16,
  },
  cardTime: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginTop: 6,
    opacity: 0.75,
  },
  messageImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    marginBottom: 8,
  },

  thinkingCard: {
    borderWidth: 1,
    borderRadius: 14,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 2,
  },
  thinkingLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontStyle: 'italic',
  },

  // Sections (quick actions / recommendations)
  sectionWrap: {
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  sectionWrapIndented: {
    // Aligns section content under the reply text in the thread view, where
    // each ChatBubble's 22px Mark + 8px gap pushes the bubble in by 30px.
    // Not applied on the hero screen, which has no avatar to align against.
    marginLeft: 30,
  },
  sectionLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  // Quick action cards — vertical, fully rounded, no shadow
  actionsCol: {
    gap: 10,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 999,
    paddingLeft: 19,
    paddingRight: 7,
    paddingVertical: 7,
    minHeight: 55,
    gap: 9,
  },
  choiceIcon: {
    width: 18,
    height: 18,
  },
  actionText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13.5,
    letterSpacing: 0.1,
  },
  actionCopy: {
    flex: 1,
  },
  actionArrowWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionArrow: {
    fontSize: 15,
    fontFamily: 'BakbakOne-Regular',
  },

  // Category-style pill row (short options, e.g. Nails / Hair / Lashes)
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pillChipText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 0.2,
  },

  // Provider Recommendations
  recommendationsScroll: {
    flexGrow: 0,
  },
  providerCard: {
    // Widened with the logo — a 52px circle in a 96px card left almost no
    // breathing room either side of it.
    width: 104,
    marginRight: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
    // Deliberately light. These cards already read as distinct via their
    // border and card fill, so the shadow only needs to lift them slightly
    // off the surface — a heavy accent-tinted drop shadow made them look
    // like they were floating, and competed with the mark's actual glow,
    // which should be the only pronounced light on the screen.
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  // Circular, not a rounded square — a provider's logo is their identity
  // mark, and the app's square shape is reserved for Becca herself. Keeping
  // them distinct stops a provider's avatar reading as another Becca mark.
  // borderRadius must stay exactly half of width/height, or it degrades back
  // into a squircle the moment the size changes.
  logoContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  // Fills the circle edge-to-edge rather than sitting inset with a visible
  // ring of container colour around it.
  providerLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  // Initial shown when a provider has no logo — sized to sit in the same
  // 40px container the real logo uses, so the row never changes height.
  providerLogoFallback: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 21,
    lineHeight: 26,
  },
  providerName: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    textAlign: 'center',
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  providerService: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9.5,
    textAlign: 'center',
  },

  // Chat Input
  inputBar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Upward shadow so the bar reads as its own raised layer sitting above
    // the content — the negative height offset casts up rather than down,
    // which is what separates "input surface" from "page" and makes the
    // keyboard region feel like a distinct plane. Kept soft and low-opacity:
    // this is a separation cue, not a drop shadow.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  imageButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  input: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    fontWeight: '400',
    paddingVertical: 8,
    paddingHorizontal: 0,
    maxHeight: 100,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
