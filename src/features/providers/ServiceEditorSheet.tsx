/**
 * Edit one service — name, price, duration, description, and whether clients
 * can see it.
 *
 * Deliberately narrow. The fuller service editor in InfoRegScreen still owns
 * safety flags, tags, buffers, add-ons and photos; this is the set a provider
 * changes week to week, opened from the My Services manager without reposting
 * their whole catalogue.
 *
 * The one exception is findability. A service added here used to get no tags
 * at all, and client Search can only find what's written down, so a NEW
 * service — or one that still has no tags or no "who's it for" — gets tags
 * suggested from its name (suggestServiceDetails, pre-ticked), a who's-it-for
 * choice, and a description check. Once a service has tags, they're the full
 * editor's again and this sheet leaves them alone.
 *
 * Themed from the provider's own palette (passed in), like every other card on
 * that screen, rather than the app's light/dark tokens.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { withAlpha } from '../../constants/providerThemes';
import * as Haptics from 'expo-haptics';
import type { MyServiceDraft } from '../../services/databaseService';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import {
  DESCRIPTION_PROBLEM_COPY,
  TAG_GROUP_KEYS,
  TECHNIQUE_TAGS_BY_CATEGORY,
  descriptionProblem,
  emptyTagGroups,
  hasNoTags,
  mergeTagGroups,
  suggestServiceDetails,
  type ServiceAudienceValue,
  type ServiceTagGroups,
} from './serviceTags';

export interface ServiceEditorPalette {
  bg: string;
  card: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
}

export interface ServiceEditorValue {
  name: string;
  price: string;
  duration: string;
  description: string;
  /** Only offered when editing. A new service always starts on the menu. */
  isActive: boolean;
  /** As stored. Only offered here while the service has none (see above). */
  tags: ServiceTagGroups;
  audience: ServiceAudienceValue;
}

/** What a service row looks like coming in. Strings, because that's what the
 *  inputs hold — the numeric parse happens once, on save. */
export function toEditorValue(service: {
  name: string;
  price: number;
  duration_minutes: number;
  description: string | null;
  is_active: boolean;
  tags?: string[] | null;
  technique_tags?: string[] | null;
  outcome_tags?: string[] | null;
  occasion_tags?: string[] | null;
  trend_names?: string[] | null;
  audience?: Exclude<ServiceAudienceValue, ''> | null;
}): ServiceEditorValue {
  return {
    name: service.name,
    price: String(service.price ?? ''),
    duration: String(service.duration_minutes ?? ''),
    description: service.description ?? '',
    isActive: service.is_active,
    tags: {
      styleTags: service.tags ?? [],
      techniqueTags: service.technique_tags ?? [],
      outcomeTags: service.outcome_tags ?? [],
      occasionTags: service.occasion_tags ?? [],
      trendNames: service.trend_names ?? [],
    },
    audience: service.audience ?? '',
  };
}

export const EMPTY_SERVICE_VALUE: ServiceEditorValue = {
  name: '',
  price: '',
  duration: '',
  description: '',
  isActive: true,
  tags: emptyTagGroups(),
  audience: '',
};

const AUDIENCE_OPTIONS: { value: Exclude<ServiceAudienceValue, ''>; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'women', label: 'Women' },
  { value: 'men', label: 'Men' },
  { value: 'kids', label: 'Kids' },
];

/** How many unticked starter chips to offer when nothing can be suggested. */
const STARTER_CHIP_COUNT = 10;

type TagChip = { group: keyof ServiceTagGroups; tag: string };

const tagLabel = (tag: string) => tag.replace(/-/g, ' ');

/** Null when the value is usable; otherwise the reason, phrased for the
 *  provider rather than for the column that would reject it. */
function validateServiceValue(value: ServiceEditorValue): string | null {
  if (!value.name.trim()) return 'Give the service a name.';
  const price = Number(value.price);
  if (!Number.isFinite(price) || price < 0) return 'Enter a price, or 0 if it varies.';
  const duration = Number(value.duration);
  // A zero-length service is what made bookings look like they occupied no
  // time at all and never clash with anything — see the schedule-issues work.
  if (!Number.isInteger(duration) || duration <= 0) {
    return 'Enter how many minutes it takes.';
  }
  return null;
}

/** What a NEW service also needs before it's saved: enough for a client to
 *  know what it is and for Search to find it. Existing services are never
 *  blocked on these, so a price change can't be held up by an old service's
 *  missing tags; the My Services review card asks for those instead. */
function findabilityProblem(value: ServiceEditorValue, tags: ServiceTagGroups, audience: ServiceAudienceValue): string | null {
  const problem = descriptionProblem(value.description, value.name);
  if (problem) return DESCRIPTION_PROBLEM_COPY[problem];
  if (hasNoTags(tags)) return 'Tick at least one tag, so clients searching for it can find this service.';
  if (!audience) return 'Choose who this service is for.';
  return null;
}

function toDraft(
  value: ServiceEditorValue,
  isNew: boolean,
  findability: { tags: ServiceTagGroups | null; audience: ServiceAudienceValue },
): MyServiceDraft {
  return {
    name: value.name.trim(),
    price: Number(value.price),
    durationMinutes: Number(value.duration),
    description: value.description.trim() || null,
    ...(isNew ? {} : { isActive: value.isActive }),
    ...(findability.tags ? { tags: findability.tags } : {}),
    ...(findability.audience ? { audience: findability.audience } : {}),
  };
}

export default function ServiceEditorSheet({
  visible,
  initial,
  categoryName,
  fallbackKind,
  isNew,
  saving,
  palette,
  onSave,
  onClose,
}: {
  visible: boolean;
  initial: ServiceEditorValue;
  categoryName: string;
  /** The business's own category (providers.service_category), for headings
   *  whose name doesn't say ("French tips"). */
  fallbackKind?: string | null;
  isNew: boolean;
  saving: boolean;
  palette: ServiceEditorPalette;
  onSave: (draft: MyServiceDraft) => void;
  onClose: () => void;
}) {
  const bottomInset = useSystemBottomInset();
  const [value, setValue] = useState<ServiceEditorValue>(initial);
  const [error, setError] = useState<string | null>(null);
  // Until the provider taps a chip, the ticked tags follow the name as it's
  // typed. After that they're the provider's, and typing changes nothing.
  const [tagsTouched, setTagsTouched] = useState(false);
  const [audienceTouched, setAudienceTouched] = useState(false);

  // Reseed every time the sheet opens. Without this the second service you
  // tapped would open showing the first one's values.
  useEffect(() => {
    if (visible) {
      setValue(initial);
      setError(null);
      setTagsTouched(false);
      setAudienceTouched(false);
    }
  }, [visible, initial]);

  const offerTags = isNew || hasNoTags(initial.tags);
  const offerAudience = isNew || !initial.audience;

  const suggestion = useMemo(
    () => suggestServiceDetails({ name: value.name, categoryName, fallbackKind }),
    [value.name, categoryName, fallbackKind],
  );
  const tags = useMemo(
    () => (tagsTouched ? value.tags : mergeTagGroups(initial.tags, suggestion)),
    [tagsTouched, value.tags, initial.tags, suggestion],
  );
  const audience: ServiceAudienceValue = audienceTouched
    ? value.audience
    : initial.audience || suggestion.audience;

  // Ticked first, then what's worth a tap, then (only when nothing could be
  // read from the name) the category's first few technique tags to start
  // from. Keyed by group+tag, since one word can be two groups' option.
  const chips = useMemo<TagChip[]>(() => {
    const seen = new Set<string>();
    const out: TagChip[] = [];
    const push = (group: keyof ServiceTagGroups, tag: string) => {
      if (seen.has(tag)) return;
      seen.add(tag);
      out.push({ group, tag });
    };
    for (const group of TAG_GROUP_KEYS) for (const tag of tags[group]) push(group, tag);
    // A suggestion the provider unticked keeps its chip, so they can change
    // their mind; dropping it made an untick impossible to undo.
    for (const group of TAG_GROUP_KEYS) for (const tag of suggestion[group]) push(group, tag);
    for (const group of TAG_GROUP_KEYS) for (const tag of suggestion.alsoConsider[group]) push(group, tag);
    if (out.length === 0) {
      for (const tag of (TECHNIQUE_TAGS_BY_CATEGORY[suggestion.kind] ?? []).slice(0, STARTER_CHIP_COUNT)) {
        push('techniqueTags', tag);
      }
    }
    return out;
  }, [tags, suggestion]);

  const toggleChip = useCallback((chip: TagChip) => {
    Haptics.selectionAsync().catch(() => {});
    setTagsTouched(true);
    setValue(v => {
      const current = tags[chip.group];
      const next = current.includes(chip.tag) ? current.filter(t => t !== chip.tag) : [...current, chip.tag];
      return { ...v, tags: { ...tags, [chip.group]: next } };
    });
  }, [tags]);

  const descriptionHint = useMemo(() => {
    if (!value.description.trim()) return null;
    const problem = descriptionProblem(value.description, value.name);
    return problem ? DESCRIPTION_PROBLEM_COPY[problem] : null;
  }, [value.description, value.name]);

  const handleSave = useCallback(() => {
    const problem =
      validateServiceValue(value) ??
      (isNew ? findabilityProblem(value, tags, audience) : null);
    if (problem) {
      setError(problem);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setError(null);
    onSave(toDraft(value, isNew, {
      tags: offerTags && !hasNoTags(tags) ? tags : null,
      audience: offerAudience ? audience : '',
    }));
  }, [value, isNew, tags, audience, offerTags, offerAudience, onSave]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, { backgroundColor: palette.bg }]}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: palette.sub }]}>
                {categoryName.toUpperCase()}
              </Text>
              <Text style={[styles.title, { color: palette.text }]}>
                {isNew ? 'New service' : 'Edit service'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={palette.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.body}>
            {/* The price list hides a service with a swipe. This switch is the
                same action for anyone who never finds the swipe. */}
            {isNew ? null : (
              <View
                style={[styles.visibilityRow, { backgroundColor: palette.card, borderColor: palette.border }]}
              >
                <View style={styles.visibilityText}>
                  <Text style={[styles.visibilityTitle, { color: palette.text }]}>
                    {value.isActive ? 'On your menu' : 'Hidden from clients'}
                  </Text>
                  <Text style={[styles.visibilityHint, { color: palette.sub }]}>
                    {/* Only what hiding actually does. Whether a shown service
                        can be BOOKED also depends on going live and on
                        availability, so this doesn't promise that. */}
                    {value.isActive
                      ? 'Shown on your profile.'
                      : 'Not shown on your profile. Nothing is deleted.'}
                  </Text>
                </View>
                <Switch
                  value={value.isActive}
                  onValueChange={isActive => {
                    Haptics.selectionAsync().catch(() => {});
                    setValue(v => ({ ...v, isActive }));
                  }}
                  trackColor={{ false: withAlpha(palette.text, 0.18), true: palette.accent }}
                  ios_backgroundColor={withAlpha(palette.text, 0.18)}
                  thumbColor={value.isActive ? '#fff' : '#E5E5EA'}
                  accessibilityLabel="Visible to clients"
                />
              </View>
            )}

            <Text style={[styles.label, { color: palette.sub }]}>NAME</Text>
            <TextInput
              value={value.name}
              onChangeText={name => setValue(v => ({ ...v, name }))}
              placeholder="e.g. Gel Overlay"
              placeholderTextColor={palette.sub}
              style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]}
            />

            <View style={styles.pairRow}>
              <View style={styles.pairItem}>
                <Text style={[styles.label, { color: palette.sub }]}>PRICE (£)</Text>
                <TextInput
                  value={value.price}
                  onChangeText={price => setValue(v => ({ ...v, price }))}
                  keyboardType="decimal-pad"
                  placeholder="35"
                  placeholderTextColor={palette.sub}
                  style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]}
                />
              </View>
              <View style={styles.pairItem}>
                <Text style={[styles.label, { color: palette.sub }]}>MINUTES</Text>
                <TextInput
                  value={value.duration}
                  onChangeText={duration => setValue(v => ({ ...v, duration }))}
                  keyboardType="number-pad"
                  placeholder="45"
                  placeholderTextColor={palette.sub}
                  style={[styles.input, { color: palette.text, backgroundColor: palette.card, borderColor: palette.border }]}
                />
              </View>
            </View>

            <Text style={[styles.label, { color: palette.sub }]}>DESCRIPTION</Text>
            <TextInput
              value={value.description}
              onChangeText={description => setValue(v => ({ ...v, description }))}
              placeholder="What's included, what to expect"
              placeholderTextColor={palette.sub}
              multiline
              style={[
                styles.input,
                styles.inputMultiline,
                { color: palette.text, backgroundColor: palette.card, borderColor: palette.border },
              ]}
            />
            {/* A template's wording, offered, never written in for them. */}
            {!value.description.trim() && suggestion.description ? (
              <TouchableOpacity
                style={[styles.suggestRow, { borderColor: palette.border }]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setValue(v => ({ ...v, description: suggestion.description ?? '' }));
                }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Use suggested description: ${suggestion.description}`}
              >
                <Ionicons name="sparkles-outline" size={14} color={palette.accent} />
                <Text style={[styles.suggestText, { color: palette.text }]} numberOfLines={2}>
                  Use: “{suggestion.description}”
                </Text>
              </TouchableOpacity>
            ) : null}
            {descriptionHint ? (
              <Text style={[styles.hint, { color: palette.sub }]}>{descriptionHint}</Text>
            ) : null}

            {offerTags ? (
              <>
                <Text style={[styles.label, { color: palette.sub }]}>HELP CLIENTS FIND IT</Text>
                <Text style={[styles.hint, styles.hintTight, { color: palette.sub }]}>
                  {hasNoTags(tags)
                    ? 'Tick the words clients would search for.'
                    : 'Ticked from the name. Untick anything that’s wrong.'}
                </Text>
                <View style={styles.chipGrid}>
                  {chips.map(chip => {
                    const on = tags[chip.group].includes(chip.tag);
                    return (
                      <TouchableOpacity
                        key={`${chip.group}:${chip.tag}`}
                        style={[
                          styles.chip,
                          { borderColor: on ? palette.accent : palette.border, backgroundColor: on ? withAlpha(palette.accent, 0.16) : palette.card },
                        ]}
                        onPress={() => toggleChip(chip)}
                        activeOpacity={0.75}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                      >
                        <Text style={[styles.chipText, { color: on ? palette.accent : palette.text }]}>{tagLabel(chip.tag)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {offerAudience ? (
              <>
                <Text style={[styles.label, { color: palette.sub }]}>WHO’S IT FOR?</Text>
                <View style={styles.chipGrid}>
                  {AUDIENCE_OPTIONS.map(option => {
                    const on = audience === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.chip,
                          { borderColor: on ? palette.accent : palette.border, backgroundColor: on ? palette.accent : palette.card },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setAudienceTouched(true);
                          setValue(v => ({ ...v, audience: on ? '' : option.value }));
                        }}
                        activeOpacity={0.75}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[styles.chipText, { color: on ? '#FFFFFF' : palette.text }]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={[styles.footnote, { color: palette.sub }]}>
              Photos, add-ons, safety details and the full tag lists are edited
              with the rest of your profile.
            </Text>
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: palette.accent, opacity: saving ? 0.6 : 1, marginBottom: Math.max(28, bottomInset + 16) }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving…' : isNew ? 'Add service' : 'Save changes'}
            </Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(126,102,103,0.35)',
    marginTop: 10,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  eyebrow: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    marginBottom: 3,
  },
  title: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 21,
  },
  body: {
    flexGrow: 0,
  },
  label: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  pairRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pairItem: {
    flex: 1,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  visibilityText: {
    flex: 1,
  },
  visibilityTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
  },
  visibilityHint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  error: {
    color: '#FF453A',
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
    marginTop: 12,
  },
  hint: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  hintTight: {
    marginTop: 0,
    marginBottom: 8,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 8,
  },
  suggestText: {
    flex: 1,
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 12,
  },
  footnote: {
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 16,
  },
  saveButton: {
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  saveButtonText: {
    fontFamily: 'BakbakOne-Regular',
    color: '#FFFFFF',
    fontSize: 15,
  },
});
