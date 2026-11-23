import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  Loader2,
  Maximize2,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Trash2,
  User,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatShortDateTime, isSafeHttpUrl, PRIORITY_META } from '../lib/format';
import { generateUuidV4 } from '../lib/imageUtils';
import type {
  AppSettings,
  Priority,
  TaskDraft,
  TrackerCache,
} from '../types';
import { MarkdownPreview } from './MarkdownPreview';

interface TaskEditorProps {
  draft: TaskDraft;
  settings: AppSettings;
  cache: TrackerCache;
  isSyncing: boolean;
  isSubmitting: boolean;
  onUpdateDraft: (updated: TaskDraft) => void;
  onDeleteDraft: (id: string) => void;
  onSubmitDraft: (draft: TaskDraft) => Promise<void>;
  onSyncTracker: () => Promise<void>;
  onBack?: () => void;
  onOpenSettings: () => void;
  onZoomImage: (src: string, alt?: string) => void;
}

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

export function TaskEditor({
  draft,
  settings,
  cache,
  isSyncing,
  isSubmitting,
  onUpdateDraft,
  onDeleteDraft,
  onSubmitDraft,
  onSyncTracker,
  onBack,
  onOpenSettings,
  onZoomImage,
}: TaskEditorProps) {
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState('');

  useEffect(() => {
    setConfirmDelete(false);
    setAssigneeOpen(false);
    setAssigneeQuery('');
  }, [draft.id]);

  // Auto-resolve valid initial board & stage if unset and cache has boards
  const selectedBoard = useMemo(
    () => cache.boards.find((b) => b.id === draft.boardId) ?? null,
    [cache.boards, draft.boardId]
  );

  // Stages allowed for task creation: ecat 1 (To do) or 2 (In progress)
  const creatableStages = useMemo(() => {
    if (!selectedBoard) return [];
    const filtered = selectedBoard.stages.filter((s) => s.ecat === 1 || s.ecat === 2);
    return filtered.length > 0 ? filtered : selectedBoard.stages;
  }, [selectedBoard]);

  useEffect(() => {
    if (draft.status === 'sent') return;
    if (cache.boards.length === 0) return;

    let nextBoardId = draft.boardId;
    let nextStageId = draft.stageId;
    let changed = false;

    const boardExists = cache.boards.some((b) => b.id === nextBoardId);
    if (!boardExists) {
      const defBoard =
        cache.boards.find((b) => b.id === settings.defaultBoardId) ?? cache.boards[0];
      if (defBoard) {
        nextBoardId = defBoard.id;
        changed = true;
      }
    }

    const activeBoard = cache.boards.find((b) => b.id === nextBoardId);
    if (activeBoard) {
      const validStages = activeBoard.stages.filter((s) => s.ecat === 1 || s.ecat === 2);
      const pool = validStages.length > 0 ? validStages : activeBoard.stages;
      const stageExists = pool.some((s) => s.id === nextStageId);
      if (!stageExists && pool.length > 0) {
        const defStage = pool.find((s) => s.id === settings.defaultStageId) ?? pool[0];
        nextStageId = defStage.id;
        changed = true;
      }
    }

    if (changed) {
      onUpdateDraft({
        ...draft,
        boardId: nextBoardId,
        stageId: nextStageId,
        updatedAt: Date.now(),
      });
    }
  }, [cache.boards, draft, onUpdateDraft, settings.defaultBoardId, settings.defaultStageId]);

  const filteredPeople = useMemo(() => {
    const q = assigneeQuery.trim().toLowerCase();
    if (!q) return cache.people;
    return cache.people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        String(p.id).includes(q) ||
        (p.department && p.department.toLowerCase().includes(q)) ||
        (p.position && p.position.toLowerCase().includes(q))
    );
  }, [assigneeQuery, cache.people]);

  const selectedPerson = useMemo(
    () => cache.people.find((p) => p.id === draft.assigneeId) ?? null,
    [cache.people, draft.assigneeId]
  );

  const handleBoardChange = (boardId: number) => {
    const board = cache.boards.find((b) => b.id === boardId);
    const validStages = board
      ? board.stages.filter((s) => s.ecat === 1 || s.ecat === 2)
      : [];
    const pool = validStages.length > 0 ? validStages : board?.stages ?? [];
    onUpdateDraft({
      ...draft,
      boardId,
      stageId: pool[0]?.id ?? null,
      updatedAt: Date.now(),
    });
  };

  const handleDuplicateAsDraft = () => {
    onUpdateDraft({
      ...draft,
      requestId: generateUuidV4(),
      status: 'draft',
      attachedToTracker: undefined,
      remoteId: undefined,
      remoteUrl: undefined,
      sentAt: undefined,
      updatedAt: Date.now(),
    });
  };

  const isSent = draft.status === 'sent';
  const canSubmit =
    !isSent &&
    !isSubmitting &&
    draft.title.trim().length > 0 &&
    draft.boardId !== null &&
    draft.stageId !== null &&
    Boolean(settings.apiToken.trim());

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#121212]">
      {/* Editor Top Subbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] bg-[#161618] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Назад к списку задач"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {isSent ? 'Отправленная задача' : 'Редактирование черновика'}
            </p>
            <p className="truncate text-xs text-zinc-400 tabular-nums">
              {isSent && draft.sentAt
                ? `Отправлено ${formatShortDateTime(draft.sentAt)}`
                : `Создано ${formatShortDateTime(draft.createdAt)}`}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDeleteDraft(draft.id)}
                className="min-h-[44px] rounded-xl bg-red-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-red-500"
              >
                Удалить
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[44px] rounded-xl bg-white/10 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/15"
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Удалить черновик"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="mx-auto max-w-2xl space-y-5">
          {isSent ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-[#1E1E1E] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">
                    Задача создана в трекере
                    {draft.remoteId ? ` (#${draft.remoteId})` : ''}
                  </p>
                  {draft.remoteUrl && isSafeHttpUrl(draft.remoteUrl) ? (
                    <a
                      href={draft.remoteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                    >
                      <span>Открыть задачу в трекере</span>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDuplicateAsDraft}
                      className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
                    >
                      Переоткрыть как новый черновик
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteDraft(draft.id)}
                      className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-3.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-500/15 hover:text-red-300"
                    >
                      Убрать из списка
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Attached Screenshot */}
          {draft.imageDataUrl ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400">
                  Прикреплённый скриншот
                </label>
                {draft.attachedToTracker ? (
                  <span className="text-xs text-emerald-400">Прикреплён к задаче в трекере</span>
                ) : draft.uploadedImageUrl ? (
                  <span className="text-xs text-emerald-400">Загружен на хостинг</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onZoomImage(draft.imageDataUrl!, draft.imageName)}
                className="group relative block w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1E1E1E]"
              >
                <img
                  src={draft.imageDataUrl}
                  alt={draft.imageName || 'Скриншот проблемы'}
                  referrerPolicy="no-referrer"
                  className="max-h-60 w-full object-contain bg-black/40"
                />
                <span className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5 rounded-xl bg-black/75 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Увеличить</span>
                </span>
              </button>
            </div>
          ) : null}

          {/* Title */}
          <div className="space-y-1.5">
            <label htmlFor="task-title" className="block text-xs font-medium text-zinc-400">
              Заголовок задачи (Title)
            </label>
            <input
              id="task-title"
              type="text"
              disabled={isSent}
              value={draft.title}
              onChange={(e) =>
                onUpdateDraft({
                  ...draft,
                  title: e.target.value,
                  updatedAt: Date.now(),
                })
              }
              placeholder="[Раздел / Подраздел]: Суть проблемы"
              className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-3.5 py-2.5 text-sm font-medium text-white placeholder:text-zinc-500 focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="task-descr" className="text-xs font-medium text-zinc-400">
                Описание (Markdown)
              </label>
              <div className="flex items-center gap-1 rounded-xl bg-[#1E1E1E] p-1 border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setPreviewMode(false)}
                  className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                    !previewMode ? 'bg-[#3B82F6] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Текст</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode(true)}
                  className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                    previewMode ? 'bg-[#3B82F6] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Вид</span>
                </button>
              </div>
            </div>

            {previewMode ? (
              <div className="min-h-[160px] rounded-xl border border-white/[0.08] bg-[#1E1E1E] p-3.5">
                {draft.descr.trim() ? (
                  <MarkdownPreview content={draft.descr} />
                ) : (
                  <p className="text-sm text-zinc-500">Описание пустое</p>
                )}
              </div>
            ) : (
              <textarea
                id="task-descr"
                rows={7}
                disabled={isSent}
                value={draft.descr}
                onChange={(e) =>
                  onUpdateDraft({
                    ...draft,
                    descr: e.target.value,
                    updatedAt: Date.now(),
                  })
                }
                placeholder="Подробное описание бага в Markdown..."
                className="w-full rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-3.5 py-2.5 text-sm leading-relaxed text-white placeholder:text-zinc-500 focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
              />
            )}
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-zinc-400">Приоритет</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRIORITIES.map((p) => {
                const meta = PRIORITY_META[p];
                const active = draft.priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={isSent}
                    onClick={() =>
                      onUpdateDraft({
                        ...draft,
                        priority: p,
                        updatedAt: Date.now(),
                      })
                    }
                    className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors disabled:opacity-60 ${
                      active
                        ? 'border-[#3B82F6] bg-[#3B82F6]/15 text-white'
                        : 'border-white/[0.08] bg-[#1E1E1E] text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${meta.dotColor}`} />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tracker Board & Stage */}
          {!settings.apiToken.trim() ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-[#1E1E1E] p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-300">
                  Укажите API-ключ трекера
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Нужен для загрузки досок, сотрудников и отправки задачи.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenSettings}
                className="min-h-[44px] shrink-0 rounded-xl bg-[#3B82F6] px-3.5 text-xs font-semibold text-white"
              >
                В настройки
              </button>
            </div>
          ) : cache.boards.length === 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#1E1E1E] p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">Списки трекера не загружены</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Загрузите доски и сотрудников, чтобы выбрать место создания задачи.
                </p>
              </div>
              <button
                type="button"
                disabled={isSyncing}
                onClick={() => void onSyncTracker()}
                className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl bg-[#3B82F6] px-3.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Загрузить</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="task-board" className="block text-xs font-medium text-zinc-400">
                  Доска (Board)
                </label>
                <select
                  id="task-board"
                  disabled={isSent}
                  value={draft.boardId ?? ''}
                  onChange={(e) => handleBoardChange(Number(e.target.value))}
                  className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-3 py-2.5 text-sm text-white focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
                >
                  <option value="" disabled>
                    Выберите доску
                  </option>
                  {cache.boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.project ? `${board.project} / ${board.title}` : board.title} (#{board.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="task-stage" className="block text-xs font-medium text-zinc-400">
                  Колонка (Stage)
                </label>
                <select
                  id="task-stage"
                  disabled={isSent || !selectedBoard}
                  value={draft.stageId ?? ''}
                  onChange={(e) =>
                    onUpdateDraft({
                      ...draft,
                      stageId: Number(e.target.value),
                      updatedAt: Date.now(),
                    })
                  }
                  className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-3 py-2.5 text-sm text-white focus:border-[#3B82F6] focus:outline-none disabled:opacity-60"
                >
                  <option value="" disabled>
                    Выберите колонку
                  </option>
                  {creatableStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.title} (#{stage.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Assignee Picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Исполнитель (Assignee)</span>
              {cache.people.length > 0 ? (
                <span className="text-xs text-zinc-500 tabular-nums">
                  {cache.people.length} чел.
                </span>
              ) : null}
            </div>

            <button
              type="button"
              disabled={isSent || cache.people.length === 0}
              onClick={() => setAssigneeOpen((prev) => !prev)}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#1E1E1E] px-3.5 py-2.5 text-left text-sm text-white transition-colors hover:border-white/20 disabled:opacity-60"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <User className="h-4 w-4 shrink-0 text-zinc-400" />
                <span className="truncate">
                  {selectedPerson
                    ? `${selectedPerson.name} (#${selectedPerson.id})`
                    : cache.people.length === 0
                      ? 'Список сотрудников не загружен'
                      : 'По умолчанию (текущий пользователь)'}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                  assigneeOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {assigneeOpen && !isSent ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#1E1E1E] p-2.5 shadow-xl">
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={assigneeQuery}
                    onChange={(e) => setAssigneeQuery(e.target.value)}
                    placeholder="Поиск по имени, отделу или ID..."
                    className="min-h-[44px] w-full rounded-xl border border-white/[0.08] bg-[#121212] pr-3 pl-9 text-sm text-white placeholder:text-zinc-500 focus:border-[#3B82F6] focus:outline-none"
                  />
                </div>

                <div className="max-h-56 space-y-1 overflow-y-auto overscroll-contain">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateDraft({
                        ...draft,
                        assigneeId: null,
                        updatedAt: Date.now(),
                      });
                      setAssigneeOpen(false);
                    }}
                    className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      draft.assigneeId === null
                        ? 'bg-[#3B82F6]/15 text-white'
                        : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span>По умолчанию (на себя)</span>
                    {draft.assigneeId === null ? (
                      <Check className="h-4 w-4 text-[#3B82F6]" />
                    ) : null}
                  </button>

                  {filteredPeople.map((person) => {
                    const active = draft.assigneeId === person.id;
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          onUpdateDraft({
                            ...draft,
                            assigneeId: person.id,
                            updatedAt: Date.now(),
                          });
                          setAssigneeOpen(false);
                        }}
                        className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                          active
                            ? 'bg-[#3B82F6]/15 text-white'
                            : 'text-zinc-200 hover:bg-white/5'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {person.name}{' '}
                            <span className="font-mono text-xs text-zinc-400 tabular-nums">
                              #{person.id}
                            </span>
                          </p>
                          {person.position || person.department ? (
                            <p className="truncate text-xs text-zinc-500">
                              {[person.position, person.department].filter(Boolean).join(' · ')}
                            </p>
                          ) : null}
                        </div>
                        {active ? <Check className="h-4 w-4 shrink-0 text-[#3B82F6]" /> : null}
                      </button>
                    );
                  })}

                  {filteredPeople.length === 0 ? (
                    <p className="py-4 text-center text-xs text-zinc-500">
                      Сотрудники не найдены
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="h-4" />
        </div>
      </div>

      {/* Bottom Submit Action Bar */}
      {!isSent ? (
        <div className="shrink-0 border-t border-white/[0.08] bg-[#161618] px-4 py-3 pb-safe">
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void onSubmitDraft(draft)}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#3B82F6] px-4 text-sm font-semibold text-white transition-all hover:bg-blue-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Отправка задачи...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Подтвердить и создать задачу</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
