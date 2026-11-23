import { normalizeThinkingLevelForModel } from './geminiConfig';
import type {
  AppSettings,
  GeminiModelId,
  GeminiThinkingLevel,
  TrackerCache,
} from '../types';

const SETTINGS_KEY = 'qa_bugsnap_settings_v1';
const CACHE_KEY = 'qa_bugsnap_tracker_cache_v1';

const VALID_MODELS = new Set<GeminiModelId>([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);

const VALID_THINKING_LEVELS = new Set<GeminiThinkingLevel>([
  'AUTO',
  'MINIMAL',
  'LOW',
  'MEDIUM',
  'HIGH',
  'XHIGH',
]);

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: 'https://bitmetrix.su/api/v1',
  apiToken: '',
  imageUploadUrl: '',
  defaultBoardId: null,
  defaultStageId: null,
  defaultAssigneeId: null,
  geminiModel: 'gemini-4-hydrogen',
  thinkingLevel: 'AUTO',
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
    const geminiModel: GeminiModelId = VALID_MODELS.has(parsed.geminiModel as GeminiModelId)
      ? (parsed.geminiModel as GeminiModelId)
      : DEFAULT_SETTINGS.geminiModel;
    const rawThinking: GeminiThinkingLevel = VALID_THINKING_LEVELS.has(
      parsed.thinkingLevel as GeminiThinkingLevel
    )
      ? (parsed.thinkingLevel as GeminiThinkingLevel)
      : DEFAULT_SETTINGS.thinkingLevel;

    return {
      baseUrl:
        typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
          ? parsed.baseUrl
          : DEFAULT_SETTINGS.baseUrl,
      apiToken: typeof parsed.apiToken === 'string' ? parsed.apiToken : '',
      imageUploadUrl: typeof parsed.imageUploadUrl === 'string' ? parsed.imageUploadUrl : '',
      defaultBoardId: typeof parsed.defaultBoardId === 'number' ? parsed.defaultBoardId : null,
      defaultStageId: typeof parsed.defaultStageId === 'number' ? parsed.defaultStageId : null,
      defaultAssigneeId: typeof parsed.defaultAssigneeId === 'number' ? parsed.defaultAssigneeId : null,
      geminiModel,
      thinkingLevel: normalizeThinkingLevelForModel(geminiModel, rawThinking),
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
