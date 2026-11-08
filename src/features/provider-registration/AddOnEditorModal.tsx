// Make or edit one of the provider's add-ons: name, price, extra time,
// description, pause, and which services it goes on. Opened from the
// "Your add-ons" list on InfoReg's services page, never from inside the
// service editor (that is already a Modal, and a second Modal on top of it
// doesn't reliably take touches on Android; ServiceAddOnsField makes new
// add-ons inline instead).
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { withAlpha } from '../../constants/providerThemes';
import type { ProviderAddOnAppliesTo } from '../../types/database';
import {
  newAddOnKey,
  ruleCovers,
  servicesWithAddOn,
  validateAddOn,
  type AddOnCategories,
  type AddOnLibraryItem,
  type AddOnServiceRef,
} from './addOnLibrary';
import { formatAddOnExtraTime } from '../bookings/addOnTime';
import {
  ADD_ON_FONTS,
  AddOnChip,
  formatAddOnPrice,
  ExtraTimeChips,
  TickBox,
  tapLight,
  tapMedium,
  tapSelect,
  tapWarn,
  type AddOnPalette,
} from './addOnUi';

export interface AddOnEditorResult {
  item: AddOnLibraryItem;
  /** True when the rule or the picked services changed, so every service
   *  should follow the rule again. False for edits that leave where it goes
   *  alone (price, name, pause), which keeps per-service exceptions. */
  placementChanged: boolean;
  /** Draft service ids, for appliesTo = 'services'. */
  pickedServiceIds: number[];
}

interface Props<S extends AddOnServiceRef> {
  visible: boolean;
  /** null = a new add-on. */
  item: AddOnLibraryItem | null;
  categories: AddOnCategories<S>;
  palette: AddOnPalette;
  onClose: () => void;
  onSave: (result: AddOnEditorResult) => void;
  onDelete: (key: string) => void;
}

const RULES: { value: ProviderAddOnAppliesTo; label: string }[] = [
  { value: 'all', label: 'Every service' },
  { value: 'categories', label: 'Categories' },
  { value: 'services', label: 'Pick services' },
];

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= 4) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

export function AddOnEditorModal<S extends AddOnServiceRef>({
  visible,
  item,
  categories,
  palette,
  onClose,
  onSave,
  onDelete,
}: Props<S>) {
  const insets = useSafeAreaInsets();
  const categoryNames = useMemo(() => Object.keys(categories), [categories]);

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [extraMinutes, setExtraMinutes] = useState(0);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [appliesTo, setAppliesTo] = useState<ProviderAddOnAppliesTo>('services');
  const [pickedCategories, setPickedCategories] = useState<string[]>([]);
  const [pickedServices, setPickedServices] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Seeded each time the sheet opens, from the item being edited (or blank
  // for a new one), so a cancelled edit never leaks into the next opening.
  useEffect(() => {
    if (!visible) return;
    setName(item?.name ?? '');
    setPrice(item ? String(item.price) : '');
    setExtraMinutes(item?.extraMinutes ?? 0);
    setDescription(item?.description ?? '');
    setIsActive(item?.isActive ?? true);
    setAppliesTo(item?.appliesTo ?? (categoryNames.length === 1 ? 'categories' : 'services'));
    setPickedCategories(item ? [...item.categoryNames] : categoryNames.length === 1 ? [...categoryNames] : []);
    setPickedServices(item ? servicesWithAddOn(categories, item.key).map(t => t.service.id) : []);
    setError(null);
    // categories is read for the opening snapshot only, so it isn't a dep.
  }, [visible, item]);

  const placementHint = useMemo(() => {
    if (appliesTo === 'services') {
      if (pickedServices.length === 0) return 'Tick the services clients can add it to.';
      return null;
    }
    const coveredNames: string[] = [];
    for (const [categoryName, services] of Object.entries(categories)) {
      if (!ruleCovers({ appliesTo, categoryNames: pickedCategories }, categoryName)) continue;
      for (const service of services) coveredNames.push(service.name || 'Untitled service');
    }
    if (appliesTo === 'categories' && pickedCategories.length === 0) return 'Pick at least one category.';
    if (coveredNames.length === 0) return 'Goes on any service you add to these categories.';
    const later = appliesTo === 'all' ? 'any service you add later' : 'any service you add to these categories later';
    return `Shows on ${listNames(coveredNames)}, plus ${later}.`;
  }, [appliesTo, pickedCategories, pickedServices.length, categories]);

  const toggleCategory = (categoryName: string) =>
    setPickedCategories(prev =>
      prev.includes(categoryName) ? prev.filter(c => c !== categoryName) : [...prev, categoryName],
    );
  const toggleService = (id: number) =>
    setPickedServices(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  const setCategoryPicked = (ids: number[], on: boolean) =>
    setPickedServices(prev => (on ? [...new Set([...prev, ...ids])] : prev.filter(id => !ids.includes(id))));

  // The card clients see when they book (AddOnPickerModal's layout), from
  // what's typed so far. Hidden until there's a name and a price that reads
  // as a number.
  const previewPrice = price.trim() === '' ? NaN : Number(price.replace(/[£,\s]/g, ''));
  const preview = name.trim() && Number.isFinite(previewPrice) && previewPrice >= 0
    ? { name: name.trim(), description: description.trim(), price: formatAddOnPrice(previewPrice), time: formatAddOnExtraTime(extraMinutes) }
    : null;

  const handleSave = () => {
    const priceValue = price.trim() === '' ? NaN : Number(price.replace(/[£,\s]/g, ''));
    const draft: AddOnLibraryItem = {
      key: item?.key ?? newAddOnKey(),
      dbId: item?.dbId ?? null,
      name: name.trim(),
      price: priceValue,
      description: description.trim(),
      extraMinutes,
      isActive,
      appliesTo,
      categoryNames: appliesTo === 'categories' ? pickedCategories : [],
    };
    const problem =
      validateAddOn(draft) ??
      (appliesTo === 'categories' && pickedCategories.length === 0 ? 'Pick at least one category, or choose another option.' : null);
    if (problem) {
      tapWarn();
      setError(problem);
      return;
    }
    const before = item ? servicesWithAddOn(categories, item.key).map(t => t.service.id).sort() : [];
    const after = [...pickedServices].sort();
    const placementChanged =
      !item ||
      item.appliesTo !== appliesTo ||
      (appliesTo === 'categories' &&
        [...item.categoryNames].sort().join('\u0000') !== [...pickedCategories].sort().join('\u0000')) ||
      (appliesTo === 'services' && before.join(',') !== after.join(','));
    tapMedium();
    onSave({ item: draft, placementChanged, pickedServiceIds: pickedServices });
  };

  const handleDelete = () => {
    if (!item) return;
    tapWarn();
    Alert.alert(
      `Delete ${item.name}?`,
      'It comes off every service. Bookings already made keep it, at the price the client paid.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.key) },
      ],
    );
  };

  const field = { backgroundColor: palette.card, borderColor: palette.border, color: palette.text };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => { tapLight(); onClose(); }} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: palette.bg }]}>
          {/* Same frame as InfoReg's service sheet: grabber, a caps eyebrow
              over the live name, a close ✕, ruled sections, a hint under
              each field, and Save fixed under the scroll. */}
          <View style={[styles.grab, { backgroundColor: palette.border }]} />
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: palette.sub }]}>{item ? 'EDIT ADD-ON' : 'NEW ADD-ON'}</Text>
              <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                {name.trim() || (item ? 'Edit add-on' : 'New add-on')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { tapLight(); onClose(); }}
              activeOpacity={0.7}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={palette.accent} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={[styles.section, { color: palette.text }]}>The add-on</Text>
            <Text style={[styles.hint, styles.sectionHint, { color: palette.sub }]}>An extra clients can add to a service when they book.</Text>

            <View style={styles.twoCol}>
              <View style={styles.nameCol}>
                <Text style={[styles.label, { color: palette.sub }]}>Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Lash removal"
                  placeholderTextColor={palette.sub}
                  maxLength={80}
                  style={[styles.input, field]}
                />
              </View>
              <View style={styles.priceCol}>
                <Text style={[styles.label, { color: palette.sub }]}>Price</Text>
                <View style={[styles.priceBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
                  <Text style={[styles.pound, { color: palette.sub }]}>£</Text>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    placeholder="0"
                    placeholderTextColor={palette.sub}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Price in pounds"
                    style={[styles.priceInput, { color: palette.text }]}
                  />
                </View>
              </View>
            </View>
            <Text style={[styles.hint, styles.fieldHint, { color: palette.sub }]}>Clients see this name and price when they book. The price is the same on every service it goes on.</Text>

            <View style={styles.group}>
              <Text style={[styles.label, { color: palette.sub }]}>Extra time</Text>
              <Text style={[styles.hint, { color: palette.sub }]}>The appointment gets this much longer when a client picks it.</Text>
              <ExtraTimeChips value={extraMinutes} onChange={setExtraMinutes} palette={palette} />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: palette.sub }]}>Description (optional)</Text>
              <Text style={[styles.hint, { color: palette.sub }]}>A line or two on what the client gets. It shows under the name.</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Safe removal of your old set before the new one"
                placeholderTextColor={palette.sub}
                maxLength={300}
                multiline
                style={[styles.input, styles.multiline, field]}
              />
            </View>

            <View style={[styles.rule, { backgroundColor: palette.border }]} />
            <Text style={[styles.section, { color: palette.text }]}>Where it goes</Text>
            <Text style={[styles.hint, styles.sectionHint, { color: palette.sub }]}>Choose which services clients can add it to.</Text>

            <View style={styles.group}>
              <View style={[styles.segment, { backgroundColor: palette.surface }]}>
                {RULES.map(rule => {
                  const on = appliesTo === rule.value;
                  return (
                    <TouchableOpacity
                      key={rule.value}
                      activeOpacity={0.8}
                      onPress={() => { tapSelect(); setAppliesTo(rule.value); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.segmentItem, on && { backgroundColor: palette.card }]}
                    >
                      <Text style={[styles.segmentText, { color: on ? palette.text : palette.sub }]}>{rule.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {appliesTo === 'categories' && (
                <View style={styles.chipRow}>
                  {categoryNames.length === 0 ? (
                    <Text style={[styles.hint, { color: palette.sub }]}>Add a category first.</Text>
                  ) : (
                    categoryNames.map(categoryName => (
                      <AddOnChip
                        key={categoryName}
                        label={categoryName}
                        active={pickedCategories.includes(categoryName)}
                        onPress={() => toggleCategory(categoryName)}
                        palette={palette}
                      />
                    ))
                  )}
                </View>
              )}

              {appliesTo === 'services' && (
                <View style={[styles.list, { borderColor: palette.border, backgroundColor: palette.card }]}>
                  {/* Grouped under each category, with a tick-all per
                      category. Tick-all ticks only the services there now;
                      to cover ones added later, "Categories" is the rule. */}
                  {Object.entries(categories).filter(([, services]) => services.length > 0).map(([categoryName, services], groupIndex) => {
                    const ids = services.map(service => service.id);
                    const pickedHere = ids.filter(id => pickedServices.includes(id)).length;
                    const allHere = pickedHere === ids.length;
                    return (
                      <View key={categoryName}>
                        <View style={[styles.groupHead, { backgroundColor: palette.surface }, groupIndex > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}>
                          <Text style={[styles.groupName, { color: palette.text }]} numberOfLines={1}>{categoryName}</Text>
                          <Text style={[styles.rowMeta, { color: palette.sub }]}>{pickedHere} of {ids.length}</Text>
                          <TouchableOpacity
                            onPress={() => { tapSelect(); setCategoryPicked(ids, !allHere); }}
                            activeOpacity={0.7}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`${allHere ? 'Untick' : 'Tick'} all ${categoryName}`}
                          >
                            <Text style={[styles.groupAction, { color: palette.accent }]}>{allHere ? 'Untick all' : 'Tick all'}</Text>
                          </TouchableOpacity>
                        </View>
                        {services.map(service => {
                          const on = pickedServices.includes(service.id);
                          return (
                            <TouchableOpacity
                              key={service.id}
                              activeOpacity={0.8}
                              onPress={() => { tapSelect(); toggleService(service.id); }}
                              accessibilityRole="checkbox"
                              accessibilityState={{ checked: on }}
                              style={[styles.listRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}
                            >
                              <TickBox on={on} palette={palette} />
                              <View style={styles.listText}>
                                <Text style={[styles.rowName, { color: palette.text }]} numberOfLines={1}>{service.name || 'Untitled service'}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                  {Object.values(categories).every(list => list.length === 0) && (
                    <Text style={[styles.hint, styles.listEmpty, { color: palette.sub }]}>Add a service first.</Text>
                  )}
                </View>
              )}

              {placementHint ? <Text style={[styles.hint, { color: palette.sub }]}>{placementHint}</Text> : null}
            </View>

            <View style={[styles.rule, { backgroundColor: palette.border }]} />
            <View style={[styles.pauseRow, { borderColor: palette.border, backgroundColor: palette.card }]}>
              <View style={styles.listText}>
                <Text style={[styles.rowName, { color: palette.text }]}>Offer it to clients</Text>
                <Text style={[styles.rowMeta, { color: palette.sub }]}>
                  {isActive ? 'Clients can add it when they book. Switch off to pause it everywhere without deleting it.' : 'Paused: hidden on every service until you switch it back on.'}
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={value => { tapSelect(); setIsActive(value); }}
                trackColor={{ true: palette.accent, false: withAlpha(palette.sub, 0.3) }}
                thumbColor="#FFFFFF"
                accessibilityLabel="Offer it to clients"
              />
            </View>

            {item && (
              <View style={styles.deleteWrap}>
                <TouchableOpacity onPress={handleDelete} activeOpacity={0.7} accessibilityRole="button" style={styles.deleteButton}>
                  <Text style={styles.deleteText}>Delete add-on</Text>
                </TouchableOpacity>
                <Text style={[styles.hint, styles.centre, { color: palette.sub }]}>Takes it off every service. Bookings already made keep it.</Text>
              </View>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            {preview && !error ? (
              <View style={[styles.preview, { borderColor: palette.border }]}>
                <Text style={[styles.label, { color: palette.sub }]}>Clients see</Text>
                <View style={styles.previewRow}>
                  <View style={styles.listText}>
                    <Text style={[styles.rowName, { color: palette.text }]} numberOfLines={1}>{preview.name}</Text>
                    {preview.description ? <Text style={[styles.rowMeta, { color: palette.sub }]} numberOfLines={1}>{preview.description}</Text> : null}
                  </View>
                  <View style={styles.previewPriceCol}>
                    <Text style={[styles.previewPrice, { color: palette.accent }]}>+{preview.price}</Text>
                    {preview.time ? <Text style={[styles.rowMeta, { color: palette.sub }]}>{preview.time}</Text> : null}
                  </View>
                </View>
              </View>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              onPress={handleSave}
              activeOpacity={0.85}
              accessibilityRole="button"
              style={[styles.save, { backgroundColor: palette.accent }]}
            >
              <Text style={[styles.saveText, { color: palette.onAccent }]}>{item ? 'Save add-on' : 'Add add-on'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(26,24,21,0.4)' },
  // Sizes below follow InfoReg's service sheet (serviceSheet* styles) so the
  // two editors read as the same kind of sheet.
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  grab: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  headerText: { flex: 1, minWidth: 0 },
  eyebrow: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 10, letterSpacing: 1.1, marginBottom: 3 },
  title: { fontFamily: ADD_ON_FONTS.display, fontSize: 21 },
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  section: { fontFamily: ADD_ON_FONTS.display, fontSize: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionHint: { marginTop: -10 },
  rule: { height: StyleSheet.hairlineWidth, marginTop: 4, marginBottom: 4 },
  twoCol: { flexDirection: 'row', gap: 12 },
  nameCol: { flex: 1.6, gap: 6 },
  priceCol: { flex: 1, gap: 6 },
  fieldHint: { marginTop: -6 },
  group: { gap: 8 },
  label: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  hint: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 11, lineHeight: 17 },
  centre: { textAlign: 'center' },
  input: {
    fontFamily: ADD_ON_FONTS.body,
    fontWeight: '600',
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  priceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingLeft: 14,
  },
  pound: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 15 },
  priceInput: {
    flex: 1,
    fontFamily: ADD_ON_FONTS.body,
    fontWeight: '600',
    fontSize: 15,
    paddingLeft: 4,
    paddingRight: 14,
    paddingVertical: 12,
  },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  groupName: { flex: 1, minWidth: 0, fontFamily: ADD_ON_FONTS.display, fontSize: 12.5, letterSpacing: 0.3 },
  groupAction: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 12 },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 2 },
  segmentItem: { flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  segmentText: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 12.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  listText: { flex: 1, minWidth: 0 },
  listEmpty: { padding: 14 },
  rowName: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 14 },
  rowMeta: { fontFamily: ADD_ON_FONTS.body, fontWeight: '600', fontSize: 12, lineHeight: 16, marginTop: 1 },
  pauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deleteWrap: { alignItems: 'center', gap: 2 },
  deleteButton: { paddingVertical: 6 },
  deleteText: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 14, color: '#FF453A' },
  footer: { paddingHorizontal: 20, paddingTop: 12 },
  preview: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10, gap: 4 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewPriceCol: { alignItems: 'flex-end' },
  previewPrice: { fontFamily: ADD_ON_FONTS.display, fontSize: 15 },
  error: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 12, color: '#FF453A', marginBottom: 10, textAlign: 'center' },
  save: { borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  saveText: { fontFamily: ADD_ON_FONTS.display, fontSize: 15 },
});
