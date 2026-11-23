import {
  ArrowRight,
  ImagePlus,
  Loader2,
  RotateCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { formatShortDateTime, PRIORITY_META } from '../lib/format';
import {
  formatGeminiErrorDisplay,
  GEMINI_MODELS,
  getGeminiModelOption,
  normalizeThinkingLevelForModel,
  THINKING_LEVEL_META,
} from '../lib/geminiConfig';
import { processImageFile, type ProcessedImage } from '../lib/imageUtils';
import type {
  ChatMessage,
  GeminiModelId,
  GeminiThinkingLevel,
  RetryAnalyzePayload,
} from '../types';
import { MarkdownPreview } from './MarkdownPreview';

interface ChatScreenProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  hasTrackerToken: boolean;
  geminiModel: GeminiModelId;
  thinkingLevel: GeminiThinkingLevel;
  onChangeGeminiConfig: (model: GeminiModelId, level: GeminiThinkingLevel) => void;
  onSend: (params: { image: ProcessedImage | null; comment: string }) => Promise<void>;
  onRetryRequest: (params: {
    payload: RetryAnalyzePayload;
    errorMessageId?: string;
    modelOverride?: GeminiModelId;
  }) => Promise<void>;
  onOpenTask: (taskId: string) => void;
  onClearChat: () => void;
  onOpenSettings: () => void;
  onZoomImage: (src: string, alt?: string) => void;
  onNotifyError: (title: string, description?: string) => void;
}

function findPrecedingUserPayload(
  messages: ChatMessage[],
  errorIndex: number
): RetryAnalyzePayload | null {
  for (let i = errorIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') {
      return (
        m.retryPayload ?? {
          imageDataUrl: m.imageDataUrl,
          imageMimeType: m.imageMimeType,
          imageName: m.imageName,
          comment: m.text,
        }
      );
    }
  }
  return null;
}

export function ChatScreen({
  messages,
  isGenerating,
  hasTrackerToken,
  geminiModel,
  thinkingLevel,
  onChangeGeminiConfig,
  onSend,
  onRetryRequest,
  onOpenTask,
  onClearChat,
  onOpenSettings,
  onZoomImage,
  onNotifyError,
}: ChatScreenProps) {
  const [comment, setComment] = useState('');
  const [pendingImage, setPendingImage] = useState<ProcessedImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const activeModelOption = useMemo(() => getGeminiModelOption(geminiModel), [geminiModel]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isGenerating]);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const processed = await processImageFile(file);
        setPendingImage(processed);
      } catch (err) {
        onNotifyError(
          'Ошибка изображения',
          err instanceof Error ? err.message : 'Не удалось обработать файл.'
        );
      }
    },
    [onNotifyError]
  );

  // Global Ctrl+V paste support while on the Chat screen
  useEffect(() => {
    const handleWindowPaste = (e: globalThis.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void handleFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [handleFile]);

  const handleTextareaPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void handleFile(file);
          return;
        }
      }
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      void handleFile(file);
    }
  };

  const handleSubmit = async () => {
    const cleanComment = comment.trim();
    if ((!pendingImage && !cleanComment) || isGenerating) return;

    const imageToSend = pendingImage;
    setComment('');
    setPendingImage(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    await onSend({ image: imageToSend, comment: cleanComment });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      if (window.innerWidth >= 768) {
        e.preventDefault();
        void handleSubmit();
      }
    }
  };

  const adjustTextareaHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const canSend = (Boolean(pendingImage) || comment.trim().length > 0) && !isGenerating;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="relative flex h-full min-h-0 flex-col bg-[#121212]"
    >
      {isDragging ? (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-[#3B82F6] bg-[#121212]/90 backdrop-blur-sm">
          <div className="text-center">
            <ImagePlus className="mx-auto h-8 w-8 text-[#3B82F6]" />
            <p className="mt-2 text-sm font-medium text-white">Отпустите скриншот для прикрепления</p>
          </div>
        </div>
      ) : null}

      {/* Scrollable Message Stream */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {!hasTrackerToken && messages.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#1E1E1E] p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#F4F4F5]">
                  Трекер ещё не подключён
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Черновики уже можно создавать, а для отправки укажите API-ключ в настройках.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="min-h-[44px] shrink-0 rounded-xl bg-white/10 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-white/15"
              >
                Настроить
              </button>
            </div>
          ) : null}

          {messages.length === 0 ? (
            <div className="my-auto flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#1E1E1E] text-[#3B82F6]">
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-white">
                Быстрый баг-репорт по скриншоту
              </h2>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
                Прикрепите скриншот экрана (или вставьте через{' '}
                <span className="font-mono text-xs text-zinc-300">Ctrl+V</span>) и напишите
                короткую заметку — ИИ оформит заголовок, описание и приоритет в черновик.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span>Прикрепить скриншот</span>
                </button>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  'Кнопка перекрывается текстом',
                  'Дублируется имя в списке',
                  'Ошибка 500 при сохранении',
                ].map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => {
                      setComment(hint);
                      textareaRef.current?.focus();
                    }}
                    className="min-h-[40px] rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  История текущей сессии · все задачи сохраняются в «Задачи»
                </span>
                <button
                  type="button"
                  onClick={onClearChat}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Очистить чат</span>
                </button>
              </div>

              {messages.map((msg, idx) => {
                if (msg.role === 'user') {
                  const userRetryPayload: RetryAnalyzePayload = msg.retryPayload ?? {
                    imageDataUrl: msg.imageDataUrl,
                    imageMimeType: msg.imageMimeType,
                    imageName: msg.imageName,
                    comment: msg.text,
                  };
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[88%] space-y-2 rounded-2xl rounded-br-md bg-[#2563EB] p-3 text-white shadow-sm sm:max-w-[75%]">
                        {msg.imageDataUrl ? (
                          <button
                            type="button"
                            onClick={() => onZoomImage(msg.imageDataUrl!, msg.imageName)}
                            className="block w-full overflow-hidden rounded-xl border border-white/15 bg-black/20 text-left"
                          >
                            <img
                              src={msg.imageDataUrl}
                              alt={msg.imageName || 'Прикреплённый скриншот'}
                              referrerPolicy="no-referrer"
                              className="max-h-56 w-full object-contain"
                            />
                          </button>
                        ) : null}
                        {msg.text ? (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {msg.text}
                          </p>
                        ) : null}
                        <div className="flex items-center justify-between gap-3 pt-0.5">
                          <button
                            type="button"
                            disabled={isGenerating}
                            onClick={() =>
                              void onRetryRequest({
                                payload: userRetryPayload,
                              })
                            }
                            aria-label="Отправить запрос снова"
                            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-xs font-medium text-blue-50 transition-colors hover:bg-white/20 disabled:opacity-50"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                            <span>Повторить</span>
                          </button>
                          <p className="text-right text-[11px] text-blue-100/80 tabular-nums">
                            {formatShortDateTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (msg.role === 'error') {
                  const { message: formattedError, isOverloaded } = formatGeminiErrorDisplay(
                    msg.text,
                    msg.errorCode
                  );
                  const retryPayload =
                    msg.retryPayload ?? findPrecedingUserPayload(messages, idx);

                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-red-500/30 bg-[#1E1E1E] p-3.5 sm:max-w-[82%]">
                        <p className="text-xs font-semibold text-red-400">
                          Не удалось сгенерировать задачу
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-zinc-300 break-words">
                          {formattedError}
                        </p>

                        {retryPayload ? (
                          <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                            <button
                              type="button"
                              disabled={isGenerating}
                              onClick={() =>
                                void onRetryRequest({
                                  payload: retryPayload,
                                  errorMessageId: msg.id,
                                })
                              }
                              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#3B82F6] px-4 text-xs font-semibold text-white transition-transform hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <RotateCw className="h-3.5 w-3.5" />
                              <span>Повторить запрос</span>
                            </button>

                            {isOverloaded && geminiModel !== 'gemini-3.1-flash-lite' ? (
                              <button
                                type="button"
                                disabled={isGenerating}
                                onClick={() =>
                                  void onRetryRequest({
                                    payload: retryPayload,
                                    errorMessageId: msg.id,
                                    modelOverride: 'gemini-3.1-flash-lite',
                                  })
                                }
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <span>Через Flash Lite</span>
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                const task = msg.generatedTask;
                const pMeta = task ? PRIORITY_META[task.priority] : null;
                const modelMeta = task?.model ? getGeminiModelOption(task.model) : null;
                const levelMeta = task?.thinkingLevel
                  ? THINKING_LEVEL_META[task.thinkingLevel]
                  : null;

                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="w-full max-w-[95%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-[#1E1E1E] p-4 sm:max-w-[85%]">
                      {task ? (
                        <>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                            <span className="font-medium text-emerald-400">Сохранено в черновики</span>
                            <span aria-hidden="true">·</span>
                            {pMeta ? (
                              <span className={`font-medium ${pMeta.textColor}`}>
                                Приоритет: {pMeta.label}
                              </span>
                            ) : null}
                            {modelMeta ? (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {modelMeta.shortLabel}
                                  {levelMeta ? ` (${levelMeta.shortLabel})` : ''}
                                </span>
                              </>
                            ) : null}
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">{formatShortDateTime(msg.createdAt)}</span>
                          </div>

                          <h3 className="mt-2 text-base font-semibold leading-snug text-white">
                            {task.title}
                          </h3>

                          <div className="mt-2 border-t border-white/[0.06] pt-2">
                            <MarkdownPreview content={task.descr} />
                          </div>

                          {msg.taskId ? (
                            <div className="mt-3 flex justify-end border-t border-white/[0.06] pt-3">
                              <button
                                type="button"
                                onClick={() => onOpenTask(msg.taskId!)}
                                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-transform active:scale-[0.98] sm:w-auto"
                              >
                                <span>Открыть и отправить</span>
                                <ArrowRight className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="text-sm text-zinc-200">{msg.text}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {isGenerating ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-white/[0.08] bg-[#1E1E1E] px-4 py-3 text-sm text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin text-[#3B82F6]" />
                <span>
                  Анализирую скриншот ({activeModelOption.shortLabel},{' '}
                  {THINKING_LEVEL_META[thinkingLevel].shortLabel.toLowerCase()})...
                </span>
              </div>
            </div>
          ) : null}

          <div ref={scrollEndRef} className="h-1" />
        </div>
      </div>

      {/* Bottom Composer */}
      <div className="shrink-0 border-t border-white/[0.08] bg-[#161618] px-3 py-2">
        <div className="mx-auto max-w-3xl space-y-2">
          {/* Compact Model & Reasoning Level Selectors */}
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Модель Gemini"
              disabled={isGenerating}
              value={geminiModel}
              onChange={(e) => {
                const nextModel = e.target.value as GeminiModelId;
                const nextLevel = normalizeThinkingLevelForModel(nextModel, thinkingLevel);
                onChangeGeminiConfig(nextModel, nextLevel);
              }}
              className="min-h-[40px] w-full truncate rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-2.5 text-xs font-medium text-zinc-200 focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
            >
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Уровень рассуждений"
              disabled={isGenerating}
              value={thinkingLevel}
              onChange={(e) => {
                const nextLevel = e.target.value as GeminiThinkingLevel;
                onChangeGeminiConfig(geminiModel, nextLevel);
              }}
              className="min-h-[40px] w-full truncate rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-2.5 text-xs font-medium text-zinc-200 focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
            >
              {activeModelOption.supportedThinkingLevels.map((lvl) => (
                <option key={lvl} value={lvl}>
                  Рассуждения: {THINKING_LEVEL_META[lvl].shortLabel}
                </option>
              ))}
            </select>
          </div>

          {pendingImage ? (
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#1E1E1E] p-2">
              <button
                type="button"
                onClick={() => onZoomImage(pendingImage.dataUrl, pendingImage.fileName)}
                className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black"
              >
                <img
                  src={pendingImage.dataUrl}
                  alt={pendingImage.fileName}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white">{pendingImage.fileName}</p>
                <p className="text-[11px] text-zinc-400 tabular-nums">
                  {pendingImage.width} × {pendingImage.height} px
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                aria-label="Убрать скриншот"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Прикрепить скриншот"
              title="Прикрепить скриншот"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-[#1E1E1E] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
            >
              <ImagePlus className="h-5 w-5" />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                adjustTextareaHeight();
              }}
              onPaste={handleTextareaPaste}
              onKeyDown={handleKeyDown}
              placeholder="Опишите баг или вставьте скриншот..."
              className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-3.5 py-2.5 text-sm leading-5 text-white placeholder:text-zinc-500 focus:border-[#3B82F6] focus:outline-none"
            />

            <button
              type="button"
              disabled={!canSend}
              onClick={() => void handleSubmit()}
              aria-label="Отправить в Gemini"
              className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl transition-all ${
                canSend
                  ? 'bg-[#3B82F6] text-white hover:bg-blue-500 active:scale-95'
                  : 'bg-[#1E1E1E] text-zinc-600'
              }`}
            >
              {isGenerating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
