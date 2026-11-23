import type { AppSettings, TrackerCache } from '../types';

const SETTINGS_KEY = 'qa_bugsnap_settings_v1';
const CACHE_KEY = 'qa_bugsnap_tracker_cache_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: 'https://bitmetrix.su/api/v1',
  apiToken: '',
  imageUploadUrl: '',
  defaultBoardId: null,
  defaultStageId: null,
  defaultAssigneeId: null,
};

export const EMPTY_CACHE: TrackerCache = {
  boards: [],
  people: [],
  meId: null,
  syncedAt: null,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      baseUrl: typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim() ? parsed.baseUrl : DEFAULT_SETTINGS.baseUrl,
      apiToken: typeof parsed.apiToken === 'string' ? parsed.apiToken : '',
      imageUploadUrl: typeof parsed.imageUploadUrl === 'string' ? parsed.imageUploadUrl : '',
      defaultBoardId: typeof parsed.defaultBoardId === 'number' ? parsed.defaultBoardId : null,
      defaultStageId: typeof parsed.defaultStageId === 'number' ? parsed.defaultStageId : null,
      defaultAssigneeId: typeof parsed.defaultAssigneeId === 'number' ? parsed.defaultAssigneeId : null,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadTrackerCache(): TrackerCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { ...EMPTY_CACHE };
    const parsed = JSON.parse(raw) as Partial<TrackerCache>;
    return {
      boards: Array.isArray(parsed.boards) ? parsed.boards : [],
      people: Array.isArray(parsed.people) ? parsed.people : [],
      meId: typeof parsed.meId === 'number' ? parsed.meId : null,
      syncedAt: typeof parsed.syncedAt === 'number' ? parsed.syncedAt : null,
    };
  } catch {
    return { ...EMPTY_CACHE };
  }
}

export function saveTrackerCache(cache: TrackerCache): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}
