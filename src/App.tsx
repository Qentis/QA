import {
  ClipboardList,
  MessageSquarePlus,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChatScreen } from './components/ChatScreen';
import { ImageLightbox } from './components/ImageLightbox';
import { SettingsScreen } from './components/SettingsScreen';
import { TasksScreen } from './components/TasksScreen';
import { ToastContainer } from './components/ToastContainer';
import {
  clearAllMessages,
  deleteDraftById,
  deleteMessageById,
  getAllDrafts,
  getAllMessages,
  saveDraft,
  saveMessage,
} from './lib/db';
import { normalizeThinkingLevelForModel } from './lib/geminiConfig';
import { generateUuidV4, type ProcessedImage } from './lib/imageUtils';
import {
  loadSettings,
  loadTrackerCache,
  saveSettings,
  saveTrackerCache,
} from './lib/storage';
import {
  analyzeScreenshotWithGemini,
  attachScreenshotToTrackerTask,
  createTrackerTask,
  fetchBoardsAndPeople,
  GeminiAnalyzeError,
  uploadScreenshotImage,
} from './lib/trackerApi';
import type {
  ActiveTab,
  AppSettings,
  ChatMessage,
  GeminiModelId,
  GeminiThinkingLevel,
  RetryAnalyzePayload,
  TaskDraft,
  ToastItem,
  TrackerCache,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [cache, setCache] = useState<TrackerCache>(() => loadTrackerCache());

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [lightbox, setLightbox] = useState<{ src: string; alt?: string } | null>(null);

  const addToast = useCallback(
    (type: ToastItem['type'], title: string, description?: string) => {
      const id = generateUuidV4();
      setToasts((prev) => [...prev.slice(-3), { id, type, title, description }]);
      const duration = type === 'error' ? 8000 : 4500;
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([getAllDrafts(), getAllMessages()])
      .then(([loadedDrafts, loadedMessages]) => {
        if (!active) return;
        setDrafts(loadedDrafts);
        setMessages(loadedMessages);
      })
      .catch(() => {
        // Fallback handled inside db.ts
      });
    return () => {
      active = false;
    };
  }, []);

  const unconfirmedCount = useMemo(
    () => drafts.filter((d) => d.status === 'draft').length,
    [drafts]
  );

  const handleChangeSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const handleSyncTracker = useCallback(async () => {
    if (!settings.apiToken.trim()) {
      addToast('error', 'Не указан API-ключ', 'Введите токен трекера в настройках.');
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    try {
      const result = await fetchBoardsAndPeople(settings.baseUrl, settings.apiToken);
      const nextCache: TrackerCache = {
        boards: result.boards,
        people: result.people,
        meId: result.meId,
        syncedAt: Date.now(),
      };
      setCache(nextCache);
      saveTrackerCache(nextCache);
      addToast(
        'success',
        'Списки обновлены',
        `Досок: ${result.boards.length}, сотрудников: ${result.people.length}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка подключения к API трекера';
      setSyncError(msg);
      addToast('error', 'Ошибка синхронизации', msg);
    } finally {
      setIsSyncing(false);
    }
  }, [addToast, settings.apiToken, settings.baseUrl]);

  const handleChangeGeminiConfig = useCallback(
    (model: GeminiModelId, level: GeminiThinkingLevel) => {
      const normalizedLevel = normalizeThinkingLevelForModel(model, level);
      setSettings((prev) => {
        const next: AppSettings = {
          ...prev,
          geminiModel: model,
          thinkingLevel: normalizedLevel,
        };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  const runGeminiAnalysis = useCallback(
    async (
      payload: RetryAnalyzePayload,
      modelOverride?: GeminiModelId
    ) => {
      const activeModel = modelOverride ?? settings.geminiModel;
      const activeThinkingLevel = normalizeThinkingLevelForModel(
        activeModel,
        settings.thinkingLevel
      );

      setIsGenerating(true);
      try {
        const imageBase64 = payload.imageDataUrl
          ? payload.imageDataUrl.split(',')[1] || payload.imageDataUrl
          : undefined;

        const result = await analyzeScreenshotWithGemini({
          imageBase64,
          mimeType: payload.imageMimeType,
          comment: payload.comment,
          model: activeModel,
          thinkingLevel: activeThinkingLevel,
        });

        const defaultBoard =
          cache.boards.find((b) => b.id === settings.defaultBoardId) ??
          cache.boards[0] ??
          null;
        const validStages = defaultBoard
          ? defaultBoard.stages.filter((s) => s.ecat === 1 || s.ecat === 2)
          : [];
        const stagePool =
          validStages.length > 0 ? validStages : defaultBoard?.stages ?? [];
        const defaultStage =
          stagePool.find((s) => s.id === settings.defaultStageId) ?? stagePool[0] ?? null;

        const newDraft: TaskDraft = {
          id: generateUuidV4(),
          requestId: generateUuidV4(),
          status: 'draft',
          title: result.title,
          descr: result.descr,
          priority: result.priority,
          boardId: defaultBoard?.id ?? null,
          stageId: defaultStage?.id ?? null,
          assigneeId: settings.defaultAssigneeId ?? null,
          imageDataUrl: payload.imageDataUrl,
          imageMimeType: payload.imageMimeType,
          imageName: payload.imageName,
          userComment: payload.comment,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await saveDraft(newDraft);
        setDrafts((prev) => [newDraft, ...prev]);

        const assistantMsg: ChatMessage = {
          id: generateUuidV4(),
          role: 'assistant',
          text: result.title,
          taskId: newDraft.id,
          generatedTask: {
            ...result,
            model: result.modelUsed ?? activeModel,
            thinkingLevel: result.thinkingLevelUsed ?? activeThinkingLevel,
          },
          createdAt: Date.now(),
        };

        await saveMessage(assistantMsg);
        setMessages((prev) => [...prev, assistantMsg]);

        addToast('success', 'Черновик создан', 'Задача сохранена во вкладку «Задачи».');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка генерации через Gemini API';
        const errorCode = err instanceof GeminiAnalyzeError ? err.code : undefined;
        const errorMsg: ChatMessage = {
          id: generateUuidV4(),
          role: 'error',
          text: msg,
          errorCode,
          retryPayload: payload,
          createdAt: Date.now(),
        };
        await saveMessage(errorMsg);
        setMessages((prev) => [...prev, errorMsg]);
        addToast('error', 'Ошибка Gemini', msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      addToast,
      cache.boards,
      settings.defaultAssigneeId,
      settings.defaultBoardId,
      settings.defaultStageId,
      settings.geminiModel,
      settings.thinkingLevel,
    ]
  );

  const handleSendToGemini = useCallback(
    async ({ image, comment }: { image: ProcessedImage | null; comment: string }) => {
      const payload: RetryAnalyzePayload = {
        imageDataUrl: image?.dataUrl,
        imageMimeType: image?.mimeType,
        imageName: image?.fileName,
        comment,
      };

      const userMsg: ChatMessage = {
        id: generateUuidV4(),
        role: 'user',
        text: comment,
        imageDataUrl: image?.dataUrl,
        imageMimeType: image?.mimeType,
        imageName: image?.fileName,
        retryPayload: payload,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      await saveMessage(userMsg);
      await runGeminiAnalysis(payload);
    },
    [runGeminiAnalysis]
  );

  const handleRetryRequest = useCallback(
    async ({
      payload,
      errorMessageId,
      modelOverride,
    }: {
      payload: RetryAnalyzePayload;
      errorMessageId?: string;
      modelOverride?: GeminiModelId;
    }) => {
      if (isGenerating) return;

      if (modelOverride) {
        handleChangeGeminiConfig(modelOverride, settings.thinkingLevel);
      }

      if (errorMessageId) {
        setMessages((prev) => prev.filter((m) => m.id !== errorMessageId));
        await deleteMessageById(errorMessageId);
      } else {
        const userMsg: ChatMessage = {
          id: generateUuidV4(),
          role: 'user',
          text: payload.comment,
          imageDataUrl: payload.imageDataUrl,
          imageMimeType: payload.imageMimeType,
          imageName: payload.imageName,
          retryPayload: payload,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        await saveMessage(userMsg);
      }

      await runGeminiAnalysis(payload, modelOverride);
    },
    [handleChangeGeminiConfig, isGenerating, runGeminiAnalysis, settings.thinkingLevel]
  );

  const handleUpdateDraft = useCallback((updated: TaskDraft) => {
    setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    void saveDraft(updated);
  }, []);

  const handleDeleteDraft = useCallback(
    (id: string) => {
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      if (selectedTaskId === id) {
        setSelectedTaskId(null);
      }
      void deleteDraftById(id);
      addToast('info', 'Черновик удалён');
    },
    [addToast, selectedTaskId]
  );

  const handleSubmitDraft = useCallback(
    async (draft: TaskDraft) => {
      if (!settings.apiToken.trim()) {
        addToast('error', 'Нет API-ключа', 'Укажите API-ключ трекера в настройках.');
        return;
      }
      if (draft.boardId === null || draft.stageId === null) {
        addToast('error', 'Выберите доску и колонку', 'Без доски и колонки задачу нельзя создать.');
        return;
      }

      setSubmittingTaskId(draft.id);
      try {
        const baseDescr = draft.descr.trim();
        let finalDescr = baseDescr;
        let payloadDescr = baseDescr;
        let uploadedImageUrl = draft.uploadedImageUrl;
        const hasCustomUploader = Boolean(settings.imageUploadUrl.trim());

        if (hasCustomUploader && draft.imageDataUrl && !uploadedImageUrl) {
          uploadedImageUrl = await uploadScreenshotImage({
            uploadUrl: settings.imageUploadUrl.trim(),
            imageDataUrl: draft.imageDataUrl,
            mimeType: draft.imageMimeType,
            fileName: draft.imageName,
          });
        }

        if (uploadedImageUrl && !finalDescr.includes(uploadedImageUrl)) {
          finalDescr = finalDescr
            ? `${finalDescr}\n\n![Скриншот](${uploadedImageUrl})`
            : `![Скриншот](${uploadedImageUrl})`;
          payloadDescr = finalDescr;
        }

        const useDirectMiraMultipart = !hasCustomUploader && Boolean(draft.imageDataUrl);
        if (useDirectMiraMultipart && !payloadDescr.includes('draft:1')) {
          payloadDescr = payloadDescr
            ? `${payloadDescr}\n\n![Скриншот](draft:1)`
            : '![Скриншот](draft:1)';
        }

        const res = await createTrackerTask({
          baseUrl: settings.baseUrl,
          token: settings.apiToken,
          request_id: draft.requestId,
          board_id: draft.boardId,
          stage_id: draft.stageId,
          title: draft.title.trim(),
          descr: payloadDescr,
          assignee_id: draft.assigneeId,
          priority: draft.priority,
          attachment:
            useDirectMiraMultipart && draft.imageDataUrl
              ? {
                  imageDataUrl: draft.imageDataUrl,
                  mimeType: draft.imageMimeType,
                  fileName: draft.imageName,
                }
              : undefined,
        });

        let attachedToTracker =
          draft.attachedToTracker ||
          (useDirectMiraMultipart && (res.created || res.attachmentsCount > 0));
        let attachError: string | null = null;

        // If task already existed via idempotent request_id without attachments, attach via task_api_attach_set
        if (
          useDirectMiraMultipart &&
          draft.imageDataUrl &&
          typeof res.id === 'number' &&
          !attachedToTracker
        ) {
          try {
            await attachScreenshotToTrackerTask({
              baseUrl: settings.baseUrl,
              token: settings.apiToken,
              taskId: res.id,
              requestId: generateUuidV4(),
              imageDataUrl: draft.imageDataUrl,
              mimeType: draft.imageMimeType,
              fileName: draft.imageName,
            });
            attachedToTracker = true;
          } catch (err) {
            attachError =
              err instanceof Error
                ? err.message
                : 'Не удалось прикрепить скриншот к задаче.';
          }
        }

        const updated: TaskDraft = {
          ...draft,
          status: 'sent',
          descr: finalDescr,
          uploadedImageUrl,
          attachedToTracker,
          remoteId: res.id,
          remoteUrl: res.url,
          sentAt: Date.now(),
          updatedAt: Date.now(),
        };

        setDrafts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        await saveDraft(updated);

        if (attachError) {
          addToast(
            'error',
            res.id ? `Задача #${res.id} создана, но скриншот не прикреплён` : 'Задача создана без скриншота',
            attachError
          );
        } else {
          addToast(
            'success',
            attachedToTracker
              ? 'Задача создана и скриншот прикреплён'
              : res.created
                ? 'Задача создана в трекере'
                : 'Задача уже была создана ранее',
            res.id ? `Номер задачи: #${res.id}` : undefined
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Не удалось создать задачу';
        addToast('error', 'Ошибка отправки в трекер', msg);
      } finally {
        setSubmittingTaskId(null);
      }
    },
    [addToast, settings.apiToken, settings.baseUrl, settings.imageUploadUrl]
  );

  const handleOpenTaskFromChat = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setActiveTab('tasks');
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    void clearAllMessages();
    addToast('info', 'Чат очищен', 'Сохранённые черновики остались во вкладке «Задачи».');
  }, [addToast]);

  const hideMobileBottomNav = activeTab === 'tasks' && selectedTaskId !== null;

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#121212] text-[#F4F4F5]">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <ImageLightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />

      {/* Compact Top App Bar (52px) */}
      <header className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] bg-[#161618] px-4">
        <button
          type="button"
          onClick={() => {
            setActiveTab('chat');
            setSelectedTaskId(null);
          }}
          className="text-left text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          QA BugSnap
        </button>

        <button
          type="button"
          onClick={() => setActiveTab(activeTab === 'settings' ? 'chat' : 'settings')}
          aria-label="Настройки"
          title="Настройки"
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors ${
            activeTab === 'settings'
              ? 'bg-[#3B82F6]/20 text-[#3B82F6]'
              : 'text-zinc-300 hover:bg-white/10 hover:text-white'
          }`}
        >
          <SettingsIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Main Content + Desktop Sidebar */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop Navigation Rail */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-white/[0.08] bg-[#161618] p-3 lg:flex">
          <nav aria-label="Основная навигация" className="space-y-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'chat'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <MessageSquarePlus className="h-4 w-4 shrink-0" />
              <span>Новая задача</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('tasks')}
              className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'tasks'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <ClipboardList className="h-4 w-4 shrink-0" />
                <span>Задачи</span>
              </span>
              {unconfirmedCount > 0 ? (
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {unconfirmedCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === 'settings'
                  ? 'bg-[#3B82F6] text-white'
                  : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <SettingsIcon className="h-4 w-4 shrink-0" />
              <span>Настройки</span>
            </button>
          </nav>
        </aside>

        {/* Active Screen Viewport */}
        <main className="min-w-0 flex-1 overflow-hidden">
          {activeTab === 'chat' ? (
            <ChatScreen
              messages={messages}
              isGenerating={isGenerating}
              hasTrackerToken={Boolean(settings.apiToken.trim())}
              geminiModel={settings.geminiModel}
              thinkingLevel={settings.thinkingLevel}
              onChangeGeminiConfig={handleChangeGeminiConfig}
              onSend={handleSendToGemini}
              onRetryRequest={handleRetryRequest}
              onOpenTask={handleOpenTaskFromChat}
              onClearChat={handleClearChat}
              onOpenSettings={() => setActiveTab('settings')}
              onZoomImage={(src, alt) => setLightbox({ src, alt })}
              onNotifyError={(title, desc) => addToast('error', title, desc)}
            />
          ) : activeTab === 'tasks' ? (
            <TasksScreen
              drafts={drafts}
              selectedTaskId={selectedTaskId}
              settings={settings}
              cache={cache}
              isSyncing={isSyncing}
              submittingTaskId={submittingTaskId}
              onSelectTask={setSelectedTaskId}
              onUpdateDraft={handleUpdateDraft}
              onDeleteDraft={handleDeleteDraft}
              onSubmitDraft={handleSubmitDraft}
              onSyncTracker={handleSyncTracker}
              onGoToChat={() => setActiveTab('chat')}
              onOpenSettings={() => setActiveTab('settings')}
              onZoomImage={(src, alt) => setLightbox({ src, alt })}
            />
          ) : (
            <SettingsScreen
              settings={settings}
              cache={cache}
              isSyncing={isSyncing}
              syncError={syncError}
              onChangeSettings={handleChangeSettings}
              onSyncTracker={handleSyncTracker}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (56px, thumb-zone friendly) */}
      {!hideMobileBottomNav ? (
        <nav
          aria-label="Нижняя навигация"
          className="grid shrink-0 grid-cols-2 border-t border-white/[0.08] bg-[#161618] pb-safe lg:hidden"
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('chat');
            }}
            className={`flex h-14 flex-col items-center justify-center gap-0.5 transition-colors ${
              activeTab === 'chat' ? 'text-[#3B82F6]' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquarePlus className="h-5 w-5" />
            <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
              Новая задача
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('tasks');
              setSelectedTaskId(null);
            }}
            className={`flex h-14 flex-col items-center justify-center gap-0.5 transition-colors ${
              activeTab === 'tasks' ? 'text-[#3B82F6]' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <div className="relative flex items-center justify-center">
              <ClipboardList className="h-5 w-5" />
              {unconfirmedCount > 0 ? (
                <span className="ml-1 font-mono text-[11px] font-bold tabular-nums">
                  {unconfirmedCount}
                </span>
              ) : null}
            </div>
            <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
              Задачи
            </span>
          </button>
        </nav>
      ) : null}
    </div>
  );
}
