// src/features/maintenance/useMaintenance.ts
//
// Loads and mutates the signed-in client's Beauty Maintenance data for the
// Beauty Profile screen. Screen-level state (not a context): only this screen
// reads it, and the Profile tab badge does its own two cheap reads.
//
// If the migration isn't applied yet the reads throw (missing relation); the
// hook reports `error` and the screen offers a retry — it never crashes and
// never pretends the list is empty.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addMaintenanceItems,
  deleteMaintenanceItem,
  getMaintenanceBookingContext,
  getMaintenanceItems,
  getMaintenanceSettings,
  getNotificationPreferences,
  saveMaintenanceSettings,
  setMaintenanceRemindersOptIn,
  updateMaintenanceItem,
  type MaintenanceItemPatch,
} from '../../services/databaseService';
import type {
  MaintenanceBookingContext,
  MaintenanceItem,
  MaintenanceSettings,
  NewMaintenanceItem,
} from '../../types/maintenance';
import { logger } from '../../utils/logger';
import type { UpcomingCoverage } from './presentation';

const EMPTY_CONTEXT: MaintenanceBookingContext = {
  prep: [],
  aftercare: [],
  upcomingServiceIds: [],
  upcomingProviderIds: [],
  pastProviders: [],
};

export interface MaintenanceState {
  loading: boolean;
  error: boolean;
  items: MaintenanceItem[];
  settings: MaintenanceSettings | null;
  context: MaintenanceBookingContext;
  coverage: UpcomingCoverage;
  /** Null while unknown (load failed); the opt-in is off until the client turns it on. */
  remindersOn: boolean | null;
  reload: () => Promise<void>;
  addItems: (items: NewMaintenanceItem[]) => Promise<void>;
  updateItem: (id: string, patch: MaintenanceItemPatch) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  saveSettings: (settings: MaintenanceSettings) => Promise<void>;
  setRemindersOn: (on: boolean) => Promise<void>;
}

export function useMaintenance(userId: string | null): MaintenanceState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [settings, setSettings] = useState<MaintenanceSettings | null>(null);
  const [context, setContext] = useState<MaintenanceBookingContext>(EMPTY_CONTEXT);
  const [remindersOn, setRemindersOnState] = useState<boolean | null>(null);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!userId) {
      setItems([]); setSettings(null); setContext(EMPTY_CONTEXT); setRemindersOnState(null);
      setLoading(false); setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [nextItems, nextSettings, nextContext, prefs] = await Promise.all([
        getMaintenanceItems(),
        getMaintenanceSettings(),
        getMaintenanceBookingContext(),
        getNotificationPreferences(),
      ]);
      if (requestId !== requestRef.current) return;
      setItems(nextItems);
      setSettings(nextSettings);
      setContext(nextContext);
      setRemindersOnState(prefs.maintenanceReminders);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      logger.error('[Maintenance] load failed:', err);
      setError(true);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  // Mutations throw; the caller shows the failure where the client is looking.
  const addItems = useCallback(async (next: NewMaintenanceItem[]) => {
    const added = await addMaintenanceItems(next);
    setItems(prev => [...prev, ...added]);
  }, []);

  const updateItem = useCallback(async (id: string, patch: MaintenanceItemPatch) => {
    const updated = await updateMaintenanceItem(id, patch);
    setItems(prev => prev.map(i => (i.id === id ? updated : i)));
  }, []);

  const deleteItem = useCallback(async (id: string) => {
    await deleteMaintenanceItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const saveSettings = useCallback(async (next: MaintenanceSettings) => {
    await saveMaintenanceSettings(next);
    setSettings(next);
  }, []);

  const setRemindersOn = useCallback(async (on: boolean) => {
    await setMaintenanceRemindersOptIn(on);
    setRemindersOnState(on);
  }, []);

  const coverage = useMemo<UpcomingCoverage>(() => ({
    serviceIds: new Set(context.upcomingServiceIds),
    providerIds: new Set(context.upcomingProviderIds),
  }), [context.upcomingServiceIds, context.upcomingProviderIds]);

  return {
    loading, error, items, settings, context, coverage, remindersOn,
    reload, addItems, updateItem, deleteItem, saveSettings, setRemindersOn,
  };
}
