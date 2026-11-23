import type { GeminiModelId, GeminiThinkingLevel } from '../types';

export interface GeminiModelOption {
  id: GeminiModelId;
  label: string;
  shortLabel: string;
  description: string;
  supportedThinkingLevels: GeminiThinkingLevel[];
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    shortLabel: 'Hydrogen',
    description: 'Сбалансированная модель для анализа скриншотов (по умолчанию).',
    supportedThinkingLevels: ['AUTO', 'LOW', 'MEDIUM', 'HIGH', 'XHIGH'],
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    shortLabel: 'Flash Lite',
    description: 'Быстрая и лёгкая модель, устойчива к пиковым нагрузкам.',
    supportedThinkingLevels: ['AUTO', 'MINIMAL', 'LOW', 'MEDIUM', 'HIGH'],
  },
];

export const THINKING_LEVEL_META: Record<
  GeminiThinkingLevel,
  { label: string; shortLabel: string; hint: string }
> = {
  AUTO: {
    label: 'Авто (по умолчанию)',
    shortLabel: 'Авто',
    hint: 'Модель сама выбирает глубину рассуждений',
  },
  MINIMAL: {
    label: 'Минимальный (без рассуждений)',
    shortLabel: 'Мин.',
    hint: 'Максимально быстрый ответ (для Flash Lite)',
  },
  LOW: {
    label: 'Низкий (Low)',
    shortLabel: 'Низкий',
    hint: 'Минимальная задержка и быстрый разбор',
  },
  MEDIUM: {
    label: 'Средний (Medium)',
    shortLabel: 'Средний',
    hint: 'Баланс скорости и точности формулировок',
  },
  HIGH: {
    label: 'Высокий (High)',
    shortLabel: 'Высокий',
    hint: 'Тщательный анализ деталей интерфейса',
  },
  XHIGH: {
    label: 'Максимальный (XHigh)',
    shortLabel: 'Макс.',
    hint: 'Глубокий анализ сложных сценариев (для Hydrogen)',
  },
};

export function getGeminiModelOption(modelId: GeminiModelId): GeminiModelOption {
  return GEMINI_MODELS.find((m) => m.id === modelId) ?? GEMINI_MODELS[0];
}

export function normalizeThinkingLevelForModel(
  modelId: GeminiModelId,
  level: GeminiThinkingLevel
): GeminiThinkingLevel {
  const option = getGeminiModelOption(modelId);
  if (option.supportedThinkingLevels.includes(level)) {
    return level;
  }
  if (level === 'XHIGH') return 'HIGH';
  if (level === 'MINIMAL') return 'LOW';
  return 'AUTO';
}

export function formatGeminiErrorDisplay(rawText: string, errorCode?: string): {
  message: string;
  isOverloaded: boolean;
} {
  const trimmed = rawText.trim();
  const isOverloaded =
    errorCode === 'model_overloaded' ||
    trimmed.includes('503') ||
    trimmed.includes('UNAVAILABLE') ||
    trimmed.toLowerCase().includes('high demand');

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed?.error?.code === 503 || parsed?.error?.status === 'UNAVAILABLE') {
        return {
          message:
            'Выбранная модель Gemini временно перегружена (503). Нажмите «Повторить запрос» или переключитесь на Gemini 3.1 Flash Lite.',
          isOverloaded: true,
        };
      }
      if (parsed?.error?.message) {
        return {
          message: parsed.error.message,
          isOverloaded,
        };
      }
    } catch {
      // Keep original text if not JSON
    }
  }

  return {
    message: rawText,
    isOverloaded,
  };
}
