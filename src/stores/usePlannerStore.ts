import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { PortfolioItem, ServiceCategory } from '../data/providerProfiles';
import { getProviderForItem } from '../data/portfolioFeed';

export interface PlanTask {
  id: string;
  portfolioItemId: string;
  serviceName: string;
  providerName?: string;
  providerId?: string;
  scheduledDate?: string;
  status: 'planned' | 'scheduled' | 'booked' | 'completed';
  notes?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  category?: string;
}

export interface PlanEvent {
  id: string;
  name: string;
  date: string;
  goalImageId?: string;
  tasks: PlanTask[];
  checklist: ChecklistItem[];
  createdAt: string;
}

interface PlannerStore {
  events: PlanEvent[];
  activeEventId: string | null;

  // Event CRUD
  createEvent: (name: string, date: string, goalImageId?: string) => Promise<PlanEvent>;
  updateEvent: (eventId: string, updates: Partial<PlanEvent>) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  setActiveEvent: (eventId: string | null) => void;
  getActiveEvent: () => PlanEvent | undefined;

  // Task management
  addTask: (eventId: string, portfolioItem: PortfolioItem) => Promise<void>;
  updateTask: (eventId: string, taskId: string, updates: Partial<PlanTask>) => Promise<void>;
  removeTask: (eventId: string, taskId: string) => Promise<void>;

  // Checklist
  addChecklistItem: (eventId: string, text: string, category?: string) => Promise<void>;
  toggleChecklistItem: (eventId: string, itemId: string) => Promise<void>;
  removeChecklistItem: (eventId: string, itemId: string) => Promise<void>;

  // Persistence
  loadEvents: () => Promise<void>;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const CHECKLIST_SUGGESTIONS: Record<string, string[]> = {
  HAIR: ['Satin bonnet', 'Edge control', 'Hair oil', 'Wide-tooth comb', 'Bobby pins'],
  NAILS: ['Nail file', 'Cuticle oil', 'Hand cream', 'Nail polish remover'],
  MUA: ['Setting spray', 'Makeup wipes', 'Blotting papers', 'Mirror'],
  LASHES: ['Lash cleanser', 'Spoolie brush', 'Lash sealer', 'Silk pillowcase'],
  BROWS: ['Brow gel', 'Spoolie', 'Aftercare cream', 'Sun protection'],
  AESTHETICS: ['Arnica cream', 'Ice pack', 'SPF 50', 'Gentle cleanser'],
};

export function suggestChecklistItems(event: PlanEvent): ChecklistItem[] {
  const categories = new Set(event.tasks.map(t => {
    // Derive category from portfolio item or provider service
    return t.serviceName;
  }));

  const suggestions: ChecklistItem[] = [];
  const seen = new Set<string>();

  for (const task of event.tasks) {
    // Try to match category from provider
    const categoryKey = task.providerId
      ? Object.keys(CHECKLIST_SUGGESTIONS).find(k =>
          k === (task as any).category
        )
      : undefined;

    // Use a broader match — check each suggestion category
    for (const [cat, items] of Object.entries(CHECKLIST_SUGGESTIONS)) {
      const serviceNameLower = task.serviceName.toLowerCase();
      const catLower = cat.toLowerCase();
      if (
        serviceNameLower.includes(catLower) ||
        (cat === 'HAIR' && (serviceNameLower.includes('braid') || serviceNameLower.includes('twist') || serviceNameLower.includes('loc') || serviceNameLower.includes('cornrow'))) ||
        (cat === 'NAILS' && (serviceNameLower.includes('nail') || serviceNameLower.includes('acrylic') || serviceNameLower.includes('gel') || serviceNameLower.includes('manicure'))) ||
        (cat === 'MUA' && (serviceNameLower.includes('makeup') || serviceNameLower.includes('bridal') || serviceNameLower.includes('glam'))) ||
        (cat === 'LASHES' && (serviceNameLower.includes('lash') || serviceNameLower.includes('volume'))) ||
        (cat === 'BROWS' && (serviceNameLower.includes('brow') || serviceNameLower.includes('microblad'))) ||
        (cat === 'AESTHETICS' && (serviceNameLower.includes('filler') || serviceNameLower.includes('botox') || serviceNameLower.includes('skin')))
      ) {
        for (const item of items) {
          if (!seen.has(item)) {
            seen.add(item);
            suggestions.push({
              id: `suggest-${generateId()}`,
              text: item,
              completed: false,
              category: cat,
            });
          }
        }
      }
    }
  }

  // Filter out items that already exist in the event's checklist
  const existingTexts = new Set(event.checklist.map(c => c.text.toLowerCase()));
  return suggestions.filter(s => !existingTexts.has(s.text.toLowerCase()));
}

async function persistEvents(events: PlanEvent[]) {
  await storage.setItem(STORAGE_KEYS.PLANNER_EVENTS, events);
}

export const usePlannerStore = create<PlannerStore>((set, get) => ({
  events: [],
  activeEventId: null,

  createEvent: async (name, date, goalImageId) => {
    const newEvent: PlanEvent = {
      id: generateId(),
      name,
      date,
      ...(goalImageId != null ? { goalImageId } : {}),
      tasks: [],
      checklist: [],
      createdAt: new Date().toISOString(),
    };

    const current = get().events;
    const updated = [...current, newEvent];
    set({ events: updated, activeEventId: newEvent.id });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to save event:', error);
      set({ events: current, activeEventId: get().activeEventId });
    }

    return newEvent;
  },

  updateEvent: async (eventId, updates) => {
    const current = get().events;
    const updated = current.map(e =>
      e.id === eventId ? { ...e, ...updates } : e
    );
    set({ events: updated });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to update event:', error);
      set({ events: current });
    }
  },

  deleteEvent: async (eventId) => {
    const current = get().events;
    const updated = current.filter(e => e.id !== eventId);
    const newActiveId = get().activeEventId === eventId ? null : get().activeEventId;
    set({ events: updated, activeEventId: newActiveId });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to delete event:', error);
      set({ events: current });
    }
  },

  setActiveEvent: (eventId) => {
    set({ activeEventId: eventId });
  },

  getActiveEvent: () => {
    const { events, activeEventId } = get();
    return events.find(e => e.id === activeEventId);
  },

  addTask: async (eventId, portfolioItem) => {
    const provider = getProviderForItem(portfolioItem);
    const newTask: PlanTask = {
      id: generateId(),
      portfolioItemId: portfolioItem.id,
      serviceName: portfolioItem.caption,
      ...(provider?.name != null ? { providerName: provider.name } : {}),
      ...(provider?.id != null ? { providerId: provider.id } : {}),
      status: 'planned',
    };

    const current = get().events;
    const updated = current.map(e =>
      e.id === eventId
        ? { ...e, tasks: [...e.tasks, newTask] }
        : e
    );
    set({ events: updated });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to add task:', error);
      set({ events: current });
    }
  },

  updateTask: async (eventId, taskId, updates) => {
    const current = get().events;
    const updated = current.map(e =>
      e.id === eventId
        ? {
            ...e,
            tasks: e.tasks.map(t =>
              t.id === taskId ? { ...t, ...updates } : t
            ),
          }
        : e
    );
    set({ events: updated });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to update task:', error);
      set({ events: current });
    }
  },

  removeTask: async (eventId, taskId) => {
    const current = get().events;
    const updated = current.map(e =>
      e.id === eventId
        ? { ...e, tasks: e.tasks.filter(t => t.id !== taskId) }
        : e
    );
    set({ events: updated });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to remove task:', error);
      set({ events: current });
    }
  },

  addChecklistItem: async (eventId, text, category) => {
    const newItem: ChecklistItem = {
      id: generateId(),
      text,
      completed: false,
      ...(category != null ? { category } : {}),
    };

    const current = get().events;
    const updated = current.map(e =>
      e.id === eventId
        ? { ...e, checklist: [...e.checklist, newItem] }
        : e
    );
    set({ events: updated });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to add checklist item:', error);
      set({ events: current });
    }
  },

  toggleChecklistItem: async (eventId, itemId) => {
    const current = get().events;
    const updated = current.map(e =>
      e.id === eventId
        ? {
            ...e,
            checklist: e.checklist.map(c =>
              c.id === itemId ? { ...c, completed: !c.completed } : c
            ),
          }
        : e
    );
    set({ events: updated });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to toggle checklist item:', error);
      set({ events: current });
    }
  },

  removeChecklistItem: async (eventId, itemId) => {
    const current = get().events;
    const updated = current.map(e =>
      e.id === eventId
        ? { ...e, checklist: e.checklist.filter(c => c.id !== itemId) }
        : e
    );
    set({ events: updated });

    try {
      await persistEvents(updated);
    } catch (error) {
      console.error('Failed to remove checklist item:', error);
      set({ events: current });
    }
  },

  loadEvents: async () => {
    try {
      const events = await storage.getItem<PlanEvent[]>(STORAGE_KEYS.PLANNER_EVENTS) || [];
      set({ events });
      if (__DEV__) {
        console.log('Loaded planner events:', events.length);
      }
    } catch (error) {
      console.error('Failed to load planner events:', error);
      set({ events: [] });
    }
  },
}));
