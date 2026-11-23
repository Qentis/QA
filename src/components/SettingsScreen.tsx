import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FileKey2,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { formatShortDateTime } from '../lib/format';
import {
  GEMINI_MODELS,
  getGeminiModelOption,
  normalizeThinkingLevelForModel,
  THINKING_LEVEL_META,
} from '../lib/geminiConfig';
import { DEFAULT_SETTINGS } from '../lib/storage';
import type {
  AppSettings,
  GeminiModelId,
  GeminiThinkingLevel,
  TrackerCache,
} from '../types';

interface SettingsScreenProps {
  settings: AppSettings;
  cache: TrackerCache;
  isSyncing: boolean;
  syncError: string | null;
  onChangeSettings: (next: AppSettings) => void;
  onSyncTracker: () => Promise<void>;
}

export function SettingsScreen({
  settings,
  cache,
  isSyncing,
  syncError,
  onChangeSettings,
  onSyncTracker,
}: SettingsScreenProps) {
  const [showToken, setShowToken] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const pemInputRef = useRef<HTMLInputElement>(null);

  const isPemKey = settings.apiToken.includes('BEGIN');

  const handlePemFile = async (file: File) => {
    const text = await file.text();
    const apiMatch = text.match(/^api:\s*(https?:\/\/\S+)/im);
    let nextBaseUrl = settings.baseUrl;
    if (apiMatch?.[1]) {
      const cleanHost = apiMatch[1].trim().replace(/\/+$/, '');
      nextBaseUrl = cleanHost.endsWith('/api/v1') ? cleanHost : `${cleanHost}/api/v1`;
    }
    onChangeSettings({
      ...settings,
      baseUrl: nextBaseUrl,
      apiToken: text.trim(),
    });
  };

  const defaultBoard = useMemo(
    () => cache.boards.find((b) => b.id === settings.defaultBoardId) ?? null,
    [cache.boards, settings.defaultBoardId]
  );

  const defaultStages = useMemo(() => {
    if (!defaultBoard) return [];
    const filtered = defaultBoard.stages.filter((s) => s.ecat === 1 || s.ecat === 2);
    return filtered.length > 0 ? filtered : defaultBoard.stages;
  }, [defaultBoard]);

  const activeModelOption = useMemo(
    () => getGeminiModelOption(settings.geminiModel),
    [settings.geminiModel]
  );

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-[#121212] px-4 py-5">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">
            Настройки таск-трекера
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Параметры подключения сохраняются локально на устройстве в localStorage.
          </p>
        </div>

        {/* Connection Card */}
        <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#1E1E1E] p-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="base-url" className="text-xs font-medium text-zinc-300">
                Базовый URL API трекера
              </label>
              {settings.baseUrl !== DEFAULT_SETTINGS.baseUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    onChangeSettings({ ...settings, baseUrl: DEFAULT_SETTINGS.baseUrl })
                  }
                  className="inline-flex items-center gap-1 text-xs text-[#3B82F6] hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Сбросить</span>
                </button>
              ) : null}
            </div>
            <input
              id="base-url"
              type="url"
              inputMode="url"
              value={settings.baseUrl}
              onChange={(e) =>
                onChangeSettings({ ...settings, baseUrl: e.target.value })
              }
              placeholder="https://bitmetrix.su/api/v1"
              className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="api-token" className="text-xs font-medium text-zinc-300">
                API-ключ трекера (.pem или Bearer-токен)
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={pemInputRef}
                  type="file"
                  accept=".pem,.key,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handlePemFile(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => pemInputRef.current?.click()}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-white/10 bg-[#121212] px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-[#3B82F6] hover:text-white"
                >
                  <FileKey2 className="h-3.5 w-3.5 text-[#3B82F6]" />
                  <span>Загрузить .pem</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowToken((prev) => !prev)}
                  aria-label={showToken ? 'Скрыть ключ' : 'Показать ключ'}
                  className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-white/10 bg-[#121212] text-zinc-400 transition-colors hover:text-white"
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {showToken || isPemKey ? (
              <textarea
                id="api-token"
                rows={4}
                autoComplete="off"
                spellCheck={false}
                value={settings.apiToken}
                onChange={(e) =>
                  onChangeSettings({ ...settings, apiToken: e.target.value })
                }
                placeholder="Вставьте содержимое файла mira-*.pem (-----BEGIN PRIVATE KEY-----...) или нажмите «Загрузить .pem»"
                className="w-full rounded-xl border border-white/[0.08] bg-[#121212] p-3 font-mono text-xs leading-relaxed text-white placeholder:text-zinc-600 focus:border-[#3B82F6] focus:outline-none"
                style={
                  !showToken && isPemKey
                    ? ({ WebkitTextSecurity: 'disc' } as Record<string, string>)
                    : undefined
                }
              />
            ) : (
              <input
                id="api-token"
                type="password"
                autoComplete="off"
                value={settings.apiToken}
                onChange={(e) =>
                  onChangeSettings({ ...settings, apiToken: e.target.value })
                }
                placeholder="Вставьте .pem ключ или Bearer-токен..."
                className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-[#3B82F6] focus:outline-none"
              />
            )}

            <p className="text-[11px] leading-relaxed text-zinc-500">
              {isPemKey ? (
                <span className="text-emerald-400">
                  Обнаружен закрытый ключ .pem (Ed25519) — запросы будут подписаны автоматически.{' '}
                </span>
              ) : null}
              В Mira создайте ключ в Профиле → API-ключи с правом «Allow changes / Разрешить изменения» и выберите скачанный файл <span className="font-mono text-zinc-400">.pem</span>.
            </p>
          </div>

          <div className="pt-1">
            <button
              type="button"
              disabled={isSyncing || !settings.apiToken.trim()}
              onClick={() => void onSyncTracker()}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#3B82F6] px-4 text-sm font-semibold text-white transition-all hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Загрузка досок и сотрудников...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  <span>Обновить списки досок и сотрудников</span>
                </>
              )}
            </button>
          </div>

          {/* Connection Status */}
          {syncError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-relaxed text-red-300">
              {syncError}
            </div>
          ) : cache.syncedAt ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div className="space-y-0.5">
                <p className="font-semibold text-emerald-200">Подключено к трекеру</p>
                <p className="text-emerald-300/90 tabular-nums">
                  Досок: {cache.boards.length} · Сотрудников: {cache.people.length} · Обновлено{' '}
                  {formatShortDateTime(cache.syncedAt)}
                </p>
              </div>
            </div>
          ) : null}
        </section>

        {/* AI Model & Reasoning Level */}
        <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#1E1E1E] p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Модель ИИ и уровень рассуждений</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Эти параметры можно менять и прямо на экране чата перед отправкой.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="gemini-model" className="block text-xs font-medium text-zinc-300">
                Модель Gemini
              </label>
              <select
                id="gemini-model"
                value={settings.geminiModel}
                onChange={(e) => {
                  const nextModel = e.target.value as GeminiModelId;
                  onChangeSettings({
                    ...settings,
                    geminiModel: nextModel,
                    thinkingLevel: normalizeThinkingLevelForModel(
                      nextModel,
                      settings.thinkingLevel
                    ),
                  });
                }}
                className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {activeModelOption.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="thinking-level" className="block text-xs font-medium text-zinc-300">
                Уровень рассуждений
              </label>
              <select
                id="thinking-level"
                value={settings.thinkingLevel}
                onChange={(e) =>
                  onChangeSettings({
                    ...settings,
                    thinkingLevel: e.target.value as GeminiThinkingLevel,
                  })
                }
                className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              >
                {activeModelOption.supportedThinkingLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {THINKING_LEVEL_META[lvl].label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                {THINKING_LEVEL_META[settings.thinkingLevel].hint}.
              </p>
            </div>
          </div>
        </section>

        {/* Image Upload Endpoint (Optional) */}
        <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#1E1E1E] p-4">
          <div className="space-y-1.5">
            <label htmlFor="upload-url" className="block text-xs font-medium text-zinc-300">
              URL эндпоинта загрузки картинок (опционально)
            </label>
            <input
              id="upload-url"
              type="url"
              inputMode="url"
              value={settings.imageUploadUrl}
              onChange={(e) =>
                onChangeSettings({ ...settings, imageUploadUrl: e.target.value })
              }
              placeholder="https://files.example.com/upload"
              className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] px-3.5 py-2.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-[#3B82F6] focus:outline-none"
            />
            <p className="text-[11px] leading-relaxed text-zinc-500">
              По умолчанию скриншот отправляется прямо в{' '}
              <span className="font-mono text-zinc-400">task_api_create_set</span> и встраивается в описание через{' '}
              <span className="font-mono text-zinc-400">draft:1</span>. Внешний URL нужен только для загрузки на ваш хостинг.
            </p>
          </div>
        </section>

        {/* Defaults from Cache */}
        {cache.boards.length > 0 || cache.people.length > 0 ? (
          <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#1E1E1E] p-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Значения по умолчанию</h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                Подставляются автоматически в новые черновики.
              </p>
            </div>

            {cache.boards.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="def-board" className="block text-xs font-medium text-zinc-400">
                    Доска по умолчанию
                  </label>
                  <select
                    id="def-board"
                    value={settings.defaultBoardId ?? ''}
                    onChange={(e) => {
                      const boardId = e.target.value ? Number(e.target.value) : null;
                      const b = cache.boards.find((item) => item.id === boardId);
                      const valid = b
                        ? b.stages.filter((s) => s.ecat === 1 || s.ecat === 2)
                        : [];
                      const firstStage = valid[0]?.id ?? b?.stages[0]?.id ?? null;
                      onChangeSettings({
                        ...settings,
                        defaultBoardId: boardId,
                        defaultStageId: firstStage,
                      });
                    }}
                    className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                  >
                    <option value="">Первая доступная</option>
                    {cache.boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.project ? `${board.project} / ${board.title}` : board.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="def-stage" className="block text-xs font-medium text-zinc-400">
                    Колонка по умолчанию
                  </label>
                  <select
                    id="def-stage"
                    disabled={!defaultBoard}
                    value={settings.defaultStageId ?? ''}
                    onChange={(e) =>
                      onChangeSettings({
                        ...settings,
                        defaultStageId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Первая колонка</option>
                    {defaultStages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            {cache.people.length > 0 ? (
              <div className="space-y-1.5">
                <label htmlFor="def-assignee" className="block text-xs font-medium text-zinc-400">
                  Исполнитель по умолчанию
                </label>
                <select
                  id="def-assignee"
                  value={settings.defaultAssigneeId ?? ''}
                  onChange={(e) =>
                    onChangeSettings({
                      ...settings,
                      defaultAssigneeId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] px-3 py-2 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
                >
                  <option value="">Не задан (на себя)</option>
                  {cache.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (#{p.id})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Quick Start Guide */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#1E1E1E]">
          <button
            type="button"
            onClick={() => setGuideOpen((prev) => !prev)}
            className="flex min-h-[52px] w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold text-white">
              <BookOpen className="h-4 w-4 text-[#3B82F6]" />
              <span>Как начать работу</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-zinc-400 transition-transform ${
                guideOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {guideOpen ? (
            <div className="space-y-3 border-t border-white/[0.06] px-4 py-3.5 text-xs leading-relaxed text-zinc-300">
              <p>
                <strong className="text-white">1. Подключите трекер:</strong> создайте API-ключ в Mira / Bitmetrix с разрешением{' '}
                <span className="font-mono text-zinc-200">Allow changes</span>, вставьте его выше и нажмите{' '}
                <strong className="text-white">«Обновить списки досок и сотрудников»</strong>.
              </p>
              <p>
                <strong className="text-white">2. Сделайте баг-репорт:</strong> перейдите на вкладку{' '}
                <strong className="text-white">«Новая задача»</strong>, прикрепите скриншот из галереи или вставьте через{' '}
                <span className="font-mono text-zinc-200">Ctrl+V</span>, добавьте короткий комментарий и отправьте.
              </p>
              <p>
                <strong className="text-white">3. Проверьте и отправьте:</strong> черновик автоматически сохранится во вкладке{' '}
                <strong className="text-white">«Задачи»</strong>. Выберите доску, колонку, исполнителя и нажмите{' '}
                <strong className="text-white">«Подтвердить и создать задачу»</strong>.
              </p>
            </div>
          ) : null}
        </section>

        <div className="h-4" />
      </div>
    </div>
  );
}
