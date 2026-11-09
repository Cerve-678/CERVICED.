// "Add-ons" inside InfoReg's service editor. The provider ticks which of
// their add-ons go on this service, and can make a new one without leaving
// the editor. Typing a name suggests add-ons they already have, so "Lash
// removal" is reused rather than retyped (and priced twice).
//
// A new add-on made here isn't in the provider's list until the service is
// saved: ServiceModal hands `pending` to InfoReg with the service, and a
// cancelled edit leaves nothing behind.
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type TextStyle } from 'react-native';
import { withAlpha } from '../../constants/providerThemes';
import type { ProviderAddOnAppliesTo } from '../../types/database';
import {
  mergeAddOns,
  newAddOnKey,
  ruleCovers,
  setAddOnOnService,
  suggestAddOns,
  validateAddOn,
  type AddOnLibraryItem,
} from './addOnLibrary';
import {
  ADD_ON_FONTS,
  AddOnChip,
  ExtraTimeChips,
  TickBox,
  addOnMetaLine,
  tapMedium,
  tapSelect,
  tapWarn,
  type AddOnPalette,
} from './addOnUi';

interface Props {
  library: AddOnLibraryItem[] | undefined;
  pending: AddOnLibraryItem[];
  onPendingChange: (pending: AddOnLibraryItem[]) => void;
  tickedKeys: string[];
  onTickedChange: (keys: string[]) => void;
  categoryName: string;
  palette: AddOnPalette;
  inputStyle: StyleProp<TextStyle>;
  onInputFocus?: () => void;
}

function ruleNote(item: AddOnLibraryItem, categoryName: string): string {
  if (!item.isActive) return 'Paused: clients can\'t pick it anywhere';
  if (item.appliesTo === 'all') return 'On every service';
  if (item.appliesTo === 'categories') {
    return ruleCovers(item, categoryName) ? `On all ${categoryName}` : `On all ${item.categoryNames.join(', ')}`;
  }
  return 'On services you pick';
}

export function ServiceAddOnsField({
  library,
  pending,
  onPendingChange,
  tickedKeys,
  onTickedChange,
  categoryName,
  palette,
  inputStyle,
  onInputFocus,
}: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [extraMinutes, setExtraMinutes] = useState(0);
  const [where, setWhere] = useState<ProviderAddOnAppliesTo>('services');
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => mergeAddOns(library ?? [], pending), [library, pending]);
  const suggestions = useMemo(() => suggestAddOns(all, name, tickedKeys), [all, name, tickedKeys]);

  if (!library) {
    return (
      <Text style={[styles.note, { color: palette.sub }]}>
        Your add-ons didn't load, so they can't be changed right now. Saving keeps them as they are.
      </Text>
    );
  }

  const toggle = (key: string) => {
    tapSelect();
    onTickedChange(setAddOnOnService(tickedKeys, key, !tickedKeys.includes(key)));
  };

  const reuseExisting = (item: AddOnLibraryItem) => {
    tapSelect();
    onTickedChange(setAddOnOnService(tickedKeys, item.key, true));
    setName('');
    setError(null);
  };

  const create = () => {
    const priceValue = price.trim() === '' ? NaN : Number(price.replace(/[£,\s]/g, ''));
    const item: AddOnLibraryItem = {
      key: newAddOnKey(),
      dbId: null,
      name: name.trim(),
      price: priceValue,
      description: '',
      extraMinutes,
      isActive: true,
      appliesTo: where,
      categoryNames: where === 'categories' ? [categoryName] : [],
    };
    const problem = validateAddOn(item);
    if (problem) {
      tapWarn();
      setError(problem);
      return;
    }
    const duplicate = all.find(a => a.name.trim().toLowerCase() === item.name.toLowerCase());
    if (duplicate) {
      tapWarn();
      setError(`You already have "${duplicate.name}". Tick it above, or give this one a different name.`);
      return;
    }
    tapMedium();
    onPendingChange([...pending, item]);
    onTickedChange(setAddOnOnService(tickedKeys, item.key, true));
    setName('');
    setPrice('');
    setExtraMinutes(0);
    setWhere('services');
    setError(null);
  };

  const removePending = (key: string) => {
    tapWarn();
    onPendingChange(pending.filter(p => p.key !== key));
    onTickedChange(tickedKeys.filter(k => k !== key));
  };

  return (
    <View style={styles.wrap}>
      {all.length > 0 && (
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {all.map((item, index) => {
            const on = tickedKeys.includes(item.key);
            const isPending = pending.some(p => p.key === item.key);
            return (
              <View
                key={item.key}
                style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => toggle(item.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${item.name}, ${addOnMetaLine(item.price, item.extraMinutes)}`}
                  style={styles.rowTap}
                >
                  <TickBox on={on} palette={palette} />
                  <View style={styles.rowText}>
                    <Text style={[styles.name, { color: palette.text }, !item.isActive && styles.paused]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.sub, { color: palette.sub }]} numberOfLines={1}>
                      {isPending ? 'New · saved with this service' : ruleNote(item, categoryName)}
                    </Text>
                  </View>
                  <Text style={[styles.meta, { color: palette.text }]}>{addOnMetaLine(item.price, item.extraMinutes)}</Text>
                </TouchableOpacity>
                {isPending && (
                  <TouchableOpacity onPress={() => removePending(item.key)} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} style={styles.remove}>
                    <Text style={[styles.removeText, { color: palette.sub }]}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}
      {all.length > 0 && (
        <Text style={[styles.note, { color: palette.sub }]}>
          Prices, extra time and where else an add-on goes are changed under Your add-ons on the services page.
        </Text>
      )}

      <Text style={[styles.kicker, { color: palette.sub }]}>{all.length > 0 ? 'NEW ADD-ON' : 'ADD ONE'}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={name}
          onChangeText={text => { setName(text); setError(null); }}
          placeholder="Add-on name"
          placeholderTextColor={palette.sub}
          maxLength={80}
          onFocus={onInputFocus}
          style={[inputStyle, styles.nameInput]}
        />
        <TextInput
          value={price}
          onChangeText={text => { setPrice(text); setError(null); }}
          placeholder="£"
          placeholderTextColor={palette.sub}
          keyboardType="decimal-pad"
          onFocus={onInputFocus}
          style={[inputStyle, styles.priceInput]}
        />
      </View>

      {suggestions.length > 0 && (
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {suggestions.map((item, index) => (
            <View
              key={item.key}
              style={[styles.row, styles.suggestion, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>{item.name} · {addOnMetaLine(item.price, item.extraMinutes)}</Text>
                <Text style={[styles.sub, { color: palette.sub }]} numberOfLines={1}>You already have this one</Text>
              </View>
              <TouchableOpacity
                onPress={() => reuseExisting(item)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Use ${item.name} on this service`}
                style={[styles.use, { borderColor: palette.accent }]}
              >
                <Text style={[styles.useText, { color: palette.accent }]}>Use</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {name.trim().length > 0 && (
        <>
          <Text style={[styles.kicker, { color: palette.sub }]}>EXTRA TIME</Text>
          <Text style={[styles.note, { color: palette.sub }]}>
            Makes the appointment longer when a client picks it. They'll only see times when you're free for the whole thing.
          </Text>
          <ExtraTimeChips value={extraMinutes} onChange={setExtraMinutes} palette={palette} />
          <Text style={[styles.kicker, { color: palette.sub }]}>OFFER IT ON</Text>
          <View style={styles.chips}>
            <AddOnChip label="Just this service" active={where === 'services'} onPress={() => setWhere('services')} palette={palette} />
            {!!categoryName && (
              <AddOnChip label={`All ${categoryName}`} active={where === 'categories'} onPress={() => setWhere('categories')} palette={palette} />
            )}
            <AddOnChip label="Every service" active={where === 'all'} onPress={() => setWhere('all')} palette={palette} />
          </View>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        onPress={create}
        activeOpacity={0.8}
        accessibilityRole="button"
        style={[styles.add, { borderColor: palette.accent, backgroundColor: withAlpha(palette.accent, 0.06) }]}
      >
        <Text style={[styles.addText, { color: palette.accent }]}>+ Add to this service</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  suggestion: { gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 14 },
  paused: { opacity: 0.55 },
  sub: { fontFamily: ADD_ON_FONTS.body, fontWeight: '600', fontSize: 11.5, marginTop: 1 },
  meta: { fontFamily: ADD_ON_FONTS.display, fontSize: 13 },
  remove: { paddingHorizontal: 12, paddingVertical: 10 },
  removeText: { fontSize: 20, fontWeight: '700' },
  note: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 11.5, lineHeight: 16 },
  kicker: { fontFamily: ADD_ON_FONTS.display, fontSize: 11, letterSpacing: 1.4, marginTop: 4 },
  inputRow: { flexDirection: 'row', gap: 10 },
  nameInput: { flex: 2 },
  priceInput: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  use: { borderWidth: 1.5, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  useText: { fontFamily: ADD_ON_FONTS.display, fontSize: 12, letterSpacing: 0.5 },
  error: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 12.5, color: '#B3261E' },
  add: { borderWidth: 1.5, borderRadius: 100, paddingVertical: 11, alignItems: 'center' },
  addText: { fontFamily: ADD_ON_FONTS.display, fontSize: 13, letterSpacing: 0.5 },
});
