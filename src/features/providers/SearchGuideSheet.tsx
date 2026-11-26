import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AppTheme } from '../../constants/theme';
import type { BusinessType } from '../../types/database';
import type { ProviderAvailabilityStatus } from '../../services/databaseService';
import { BUSINESS_TYPE_META } from '../business-details/options';
import { BUSINESS_TYPE_ICON } from './profilePresentation';
import TabIcon from '../../components/TabIcon';
import { readableSheet } from '../../constants/readableWidth';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

// ── Availability colour/label — real status from get_providers_availability,
// resolved asynchronously per-card (see providersWithAvailability in
// SearchScreen). null (not yet resolved, or no data) renders no badge at all
// rather than guessing — this used to be hardcoded to 'Slots Available' on
// every card. 'none' is deliberately absent from this map (not just an unused
// key): the RPC collapses two different causes into it — a provider who's
// genuinely fully booked this week, AND a provider who has never published a
// schedule at all (has_any_open_day is false either way, see
// get_providers_availability). A "Fully Booked" badge is a false claim for the
// second case, so neither case gets a badge. Filtering (availability ===
// 'available' || 'limited') already excludes both correctly; this only affects
// the badge. Lives here so the guide shows exactly the badges the cards do. ──
export const AVAILABILITY_INFO: Partial<Record<ProviderAvailabilityStatus, { label: string; color: string }>> = {
  available: { get label() { return tr('discover.search.slotsAvailable'); }, color: '#4CAF50' },
  limited:   { get label() { return tr('discover.search.slotsLimited'); },   color: '#FF9500' },
};

// get_providers_availability counts open start times over today + the next 6
// days: 3 or more is 'available', 1–2 is 'limited'. Keep in step with it.
const AVAILABILITY_MEANING: Record<'available' | 'limited', string> = {
  available: '3 or more open times in the next 7 days.',
  limited: '1 or 2 open times in the next 7 days. Book soon.',
};

const BUSINESS_TYPES: BusinessType[] = ['salon', 'studio', 'home_based', 'mobile'];

interface RowProps {
  mark: React.ReactNode;
  /** A plain title, or the real badge/label as it appears on a card. */
  title: React.ReactNode;
  body: string;
  P: AppTheme;
}

function GuideRow({ mark, title, body, P }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.mark}>{mark}</View>
      <View style={styles.rowText}>
        {typeof title === 'string'
          ? <Text style={[styles.rowTitle, { color: P.text }]}>{title}</Text>
          : title}
        <Text style={[styles.rowBody, { color: P.sub }]}>{body}</Text>
      </View>
    </View>
  );
}

function GuideSection({ title, P }: { title: string; P: AppTheme }) {
  return <Text style={[styles.section, { color: P.sub }]}>{title}</Text>;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  P: AppTheme;
  bottomInset: number;
}

/**
 * What the icons, badges and lines on Search mean, opened from the ⓘ in the
 * Search header. Venue wording comes from BUSINESS_TYPE_META and the badges
 * from AVAILABILITY_INFO, the same sources the cards render from, so the
 * guide can't describe a card differently from how it looks.
 */
export default function SearchGuideSheet({ visible, onClose, P, bottomInset }: Props) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const { height } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent statusBarTranslucent navigationBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Sibling tap-to-dismiss overlay, never a parent of the sheet, so the
          list scrolls on the first drag (same as the Search filter sheet). */}
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={tr('discover.page.closeGuide')} />
        <View style={[styles.sheet, { backgroundColor: P.card, borderColor: P.border, paddingBottom: Math.max(20, bottomInset + 16) }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: P.text }]}>WHAT THINGS MEAN</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.done, { color: P.accentText }]}>{tr('common.done')}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ maxHeight: Math.round(height * 0.62) }}
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
            bounces
          >
            <GuideSection title={tr('discover.page.whereItHappens')} P={P} />
            <Text style={[styles.lead, { color: P.sub }]}>{tr('discover.page.theSmallIconAfterThePrice')}</Text>
            {BUSINESS_TYPES.map(type => (
              <GuideRow
                key={type}
                P={P}
                mark={<Ionicons name={BUSINESS_TYPE_ICON[type] as keyof typeof Ionicons.glyphMap} size={18} color={P.text} />}
                title={BUSINESS_TYPE_META[type].label}
                body={`${BUSINESS_TYPE_META[type].clientVenueLabel}.`}
              />
            ))}

            <GuideSection title={tr('discover.search.pill.availability')} P={P} />
            {(['available', 'limited'] as const).map(status => {
              const info = AVAILABILITY_INFO[status]!;
              return (
                <GuideRow
                  key={status}
                  P={P}
                  mark={<View style={[styles.dot, { backgroundColor: info.color }]} />}
                  title={
                    <View style={[styles.badge, { backgroundColor: `${info.color}22` }]}>
                      <Text style={[styles.badgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                  }
                  body={AVAILABILITY_MEANING[status]}
                />
              );
            })}
            <GuideRow
              P={P}
              mark={<Text style={[styles.markText, { color: P.sub }]}>–</Text>}
              title={tr('discover.page.noBadge')}
              body={tr('discover.page.noOpenTimesThisWeekOr')}
            />

            <GuideSection title={tr('discover.page.onEachCard')} P={P} />
            <GuideRow
              P={P}
              mark={<Text style={styles.star}>★</Text>}
              title="4.8 (12)"
              body={tr('discover.page.theirAverageRatingAndHowMany')}
            />
            <GuideRow
              P={P}
              mark={<Text style={[styles.markText, { color: P.text }]}>£</Text>}
              title="£25–£60"
              body={tr('discover.page.fromTheirCheapestServiceToTheir')}
            />
            <GuideRow
              P={P}
              mark={<Text style={[styles.markText, styles.underlined, { color: P.text }]}>Aa</Text>}
              title={tr('discover.page.underlinedWords')}
              body={tr('discover.page.theirSpecialitiesTheThingsTheyRe')}
            />
            <GuideRow
              P={P}
              mark={<Ionicons name="open-outline" size={18} color={P.text} />}
              title={tr('discover.search.booksOwnPage')}
              body={tr('discover.page.thisProTakesBookingsOnTheir')}
            />
            <GuideRow
              P={P}
              mark={<Text style={[styles.eyebrow, { color: P.sub }]}>SERVICE</Text>}
              title={tr('discover.page.serviceCards')}
              body={tr('discover.page.oneServiceThatMatchesWhatYou')}
            />

            <GuideSection title={tr('discover.page.searchTips')} P={P} />
            <GuideRow
              P={P}
              mark={<TabIcon name="magnifying-glass" size={16} color={P.text} />}
              title={tr('discover.page.addAPlaceOrABudget')}
              body={tr('discover.page.tryBraidsInLeedsOrNails')}
            />
            <GuideRow
              P={P}
              mark={<TabIcon name="sliders" size={16} color={P.text} />}
              title={tr('discover.home.filtersA11y')}
              body={tr('discover.page.theSlidersIconAtTheTop')}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { ...readableSheet,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 0.5 },
  done: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700' },
  section: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 6,
  },
  lead: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 12 },
  mark: { width: 52, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  markText: { fontFamily: 'BakbakOne-Regular', fontSize: 15 },
  underlined: { textDecorationLine: 'underline' },
  // Same star colour and eyebrow type as the cards themselves.
  star: { fontSize: 15, color: '#F5A623' },
  eyebrow: { fontFamily: 'BakbakOne-Regular', fontSize: 9, letterSpacing: 1.2 },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  rowBody: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17, marginTop: 1 },
  badge: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 2 },
  badgeText: { fontFamily: 'BakbakOne-Regular', fontSize: 9, letterSpacing: 0.2 },
});
