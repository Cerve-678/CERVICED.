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
import {
  ADD_ON_FONTS,
  AddOnChip,
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
        <View style={[styles.sheet, { backgroundColor: palette.bg, paddingBottom: Math.max(insets.bottom, 14) }]}>
          <View style={[styles.grab, { backgroundColor: palette.border }]} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: palette.text }]}>{item ? 'Edit add-on' : 'New add-on'}</Text>
            <TouchableOpacity onPress={() => { tapLight(); onClose(); }} activeOpacity={0.8} accessibilityRole="button">
              <Text style={[styles.headerAction, { color: palette.sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.twoCol}>
              <View style={styles.nameCol}>
                <Text style={[styles.label, { color: palette.sub }]}>NAME</Text>
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
                <Text style={[styles.label, { color: palette.sub }]}>PRICE</Text>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  placeholder="£"
                  placeholderTextColor={palette.sub}
                  keyboardType="decimal-pad"
                  style={[styles.input, field]}
                />
              </View>
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: palette.sub }]}>EXTRA TIME</Text>
              <Text style={[styles.hint, { color: palette.sub }]}>Added to the appointment when a client picks it, so only times with room for it are offered.</Text>
              <ExtraTimeChips value={extraMinutes} onChange={setExtraMinutes} palette={palette} />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: palette.sub }]}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What the client gets"
                placeholderTextColor={palette.sub}
                maxLength={300}
                multiline
                style={[styles.input, styles.multiline, field]}
              />
            </View>

            <View style={styles.group}>
              <Text style={[styles.label, { color: palette.sub }]}>{item ? 'WORKS WITH' : 'OFFER IT ON'}</Text>
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
                  {Object.entries(categories).flatMap(([categoryName, services]) =>
                    services.map((service, index) => {
                      const on = pickedServices.includes(service.id);
                      const first = categoryName === categoryNames[0] && index === 0;
                      return (
                        <TouchableOpacity
                          key={service.id}
                          activeOpacity={0.8}
                          onPress={() => { tapSelect(); toggleService(service.id); }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          style={[styles.listRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}
                        >
                          <TickBox on={on} palette={palette} />
                          <View style={styles.listText}>
                            <Text style={[styles.rowName, { color: palette.text }]} numberOfLines={1}>{service.name || 'Untitled service'}</Text>
                            <Text style={[styles.rowMeta, { color: palette.sub }]} numberOfLines={1}>{categoryName}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }),
                  )}
                  {Object.values(categories).every(list => list.length === 0) && (
                    <Text style={[styles.hint, styles.listEmpty, { color: palette.sub }]}>Add a service first.</Text>
                  )}
                </View>
              )}

              {placementHint ? <Text style={[styles.hint, { color: palette.sub }]}>{placementHint}</Text> : null}
            </View>

            <View style={[styles.pauseRow, { borderColor: palette.border, backgroundColor: palette.card }]}>
              <View style={styles.listText}>
                <Text style={[styles.rowName, { color: palette.text }]}>Offer it to clients</Text>
                <Text style={[styles.rowMeta, { color: palette.sub }]}>
                  {isActive ? 'Clients can add it when they book.' : 'Paused: hidden on every service until you switch it back on.'}
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
              <TouchableOpacity onPress={handleDelete} activeOpacity={0.8} accessibilityRole="button" style={styles.deleteButton}>
                <Text style={styles.deleteText}>Delete add-on</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(26,24,21,0.4)' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '92%',
  },
  grab: { width: 38, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontFamily: ADD_ON_FONTS.display, fontSize: 20, letterSpacing: 0.3 },
  headerAction: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 14 },
  body: { gap: 16, paddingBottom: 16 },
  twoCol: { flexDirection: 'row', gap: 10 },
  nameCol: { flex: 1.6, gap: 6 },
  priceCol: { flex: 1, gap: 6 },
  group: { gap: 8 },
  label: { fontFamily: ADD_ON_FONTS.display, fontSize: 11, letterSpacing: 1.4 },
  hint: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 12, lineHeight: 17 },
  input: {
    fontFamily: ADD_ON_FONTS.body,
    fontWeight: '600',
    fontSize: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 2 },
  segmentItem: { flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  segmentText: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 12.5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  listText: { flex: 1, minWidth: 0 },
  listEmpty: { padding: 14 },
  rowName: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 14 },
  rowMeta: { fontFamily: ADD_ON_FONTS.body, fontWeight: '600', fontSize: 12, marginTop: 1 },
  pauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  deleteButton: { alignSelf: 'center', paddingVertical: 6 },
  deleteText: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 14, color: '#B3261E' },
  error: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 13, color: '#B3261E', marginBottom: 8, textAlign: 'center' },
  save: { borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  saveText: { fontFamily: ADD_ON_FONTS.display, fontSize: 15, letterSpacing: 0.6 },
});
