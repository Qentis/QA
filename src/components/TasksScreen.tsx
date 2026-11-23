import {
  ChevronRight,
  FileImage,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatShortDateTime, PRIORITY_META } from '../lib/format';
import type { AppSettings, TaskDraft, TrackerCache } from '../types';
import { TaskEditor } from './TaskEditor';

type TaskFilter = 'draft' | 'sent' | 'all';

interface TasksScreenProps {
  drafts: TaskDraft[];
  selectedTaskId: string | null;
  settings: AppSettings;
  cache: TrackerCache;
  isSyncing: boolean;
  submittingTaskId: string | null;
  onSelectTask: (id: string | null) => void;
  onUpdateDraft: (updated: TaskDraft) => void;
  onDeleteDraft: (id: string) => void;
  onSubmitDraft: (draft: TaskDraft) => Promise<void>;
  onSyncTracker: () => Promise<void>;
  onGoToChat: () => void;
  onOpenSettings: () => void;
  onZoomImage: (src: string, alt?: string) => void;
}

export function TasksScreen({
  drafts,
  selectedTaskId,
  settings,
  cache,
  isSyncing,
  submittingTaskId,
  onSelectTask,
  onUpdateDraft,
  onDeleteDraft,
  onSubmitDraft,
  onSyncTracker,
  onGoToChat,
  onOpenSettings,
  onZoomImage,
}: TasksScreenProps) {
  const [filter, setFilter] = useState<TaskFilter>('draft');

  const draftCount = useMemo(
    () => drafts.filter((d) => d.status === 'draft').length,
    [drafts]
  );
  const sentCount = useMemo(
    () => drafts.filter((d) => d.status === 'sent').length,
    [drafts]
  );

  const visibleDrafts = useMemo(() => {
    if (filter === 'all') return drafts;
    return drafts.filter((d) => d.status === filter);
  }, [drafts, filter]);

  const selectedTask = useMemo(
    () => drafts.find((d) => d.id === selectedTaskId) ?? null,
    [drafts, selectedTaskId]
  );

  // Mobile: if a task is selected, render TaskEditor full-screen inside the main area
  if (selectedTask) {
    return (
      <div className="flex h-full min-h-0 flex-col lg:flex-row">
        {/* Desktop Left List Column */}
        <div className="hidden h-full min-h-0 w-[360px] shrink-0 flex-col border-r border-white/[0.08] bg-[#121212] lg:flex xl:w-[400px]">
          <TaskListPane
            filter={filter}
            onFilterChange={setFilter}
            draftCount={draftCount}
            sentCount={sentCount}
            totalCount={drafts.length}
            visibleDrafts={visibleDrafts}
            selectedTaskId={selectedTaskId}
            onSelectTask={onSelectTask}
            onGoToChat={onGoToChat}
          />
        </div>

        {/* Detail Editor */}
        <div className="min-w-0 flex-1 h-full min-h-0">
          <TaskEditor
            draft={selectedTask}
            settings={settings}
            cache={cache}
            isSyncing={isSyncing}
            isSubmitting={submittingTaskId === selectedTask.id}
            onUpdateDraft={onUpdateDraft}
            onDeleteDraft={onDeleteDraft}
            onSubmitDraft={onSubmitDraft}
            onSyncTracker={onSyncTracker}
            onBack={() => onSelectTask(null)}
            onOpenSettings={onOpenSettings}
            onZoomImage={onZoomImage}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="flex h-full min-h-0 w-full flex-col bg-[#121212] lg:w-[360px] lg:shrink-0 lg:border-r lg:border-white/[0.08] xl:w-[400px]">
        <TaskListPane
          filter={filter}
          onFilterChange={setFilter}
          draftCount={draftCount}
          sentCount={sentCount}
          totalCount={drafts.length}
          visibleDrafts={visibleDrafts}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          onGoToChat={onGoToChat}
        />
      </div>

      {/* Desktop empty detail placeholder */}
      <div className="hidden flex-1 flex-col items-center justify-center bg-[#121212] p-8 text-center lg:flex">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#1E1E1E] text-zinc-400">
          <FolderOpen className="h-6 w-6" />
        </div>
        <p className="mt-4 text-base font-semibold text-white">
          Выберите задачу из списка
        </p>
        <p className="mt-1.5 max-w-sm text-sm text-zinc-400">
          Откройте черновик слева, чтобы отредактировать текст, выбрать доску, исполнителя и отправить задачу в трекер.
        </p>
      </div>
    </div>
  );
}

interface TaskListPaneProps {
  filter: TaskFilter;
  onFilterChange: (f: TaskFilter) => void;
  draftCount: number;
  sentCount: number;
  totalCount: number;
  visibleDrafts: TaskDraft[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onGoToChat: () => void;
}

function TaskListPane({
  filter,
  onFilterChange,
  draftCount,
  sentCount,
  totalCount,
  visibleDrafts,
  selectedTaskId,
  onSelectTask,
  onGoToChat,
}: TaskListPaneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filter Controls */}
      <div className="shrink-0 border-b border-white/[0.08] bg-[#161618] px-4 py-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-[#121212] p-1">
          <button
            type="button"
            onClick={() => onFilterChange('draft')}
            className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              filter === 'draft'
                ? 'bg-[#3B82F6] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Черновики ({draftCount})
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('sent')}
            className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              filter === 'sent'
                ? 'bg-[#3B82F6] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Отправлено ({sentCount})
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('all')}
            className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              filter === 'all'
                ? 'bg-[#3B82F6] text-white'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Все ({totalCount})
          </button>
        </div>
      </div>

      {/* Scrollable Tasks List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {visibleDrafts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#1E1E1E] text-zinc-400">
              <FolderOpen className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white">
              {filter === 'draft'
                ? 'Нет активных черновиков'
                : filter === 'sent'
                  ? 'Нет отправленных задач'
                  : 'Список задач пока пуст'}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-400">
              Отправьте скриншот в чат с Gemini, чтобы автоматически создать черновик баг-репорта.
            </p>
            <button
              type="button"
              onClick={onGoToChat}
              className="mt-4 flex min-h-[44px] items-center gap-2 rounded-xl bg-[#3B82F6] px-4 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              <span>Новая задача</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {visibleDrafts.map((item) => {
              const pMeta = PRIORITY_META[item.priority];
              const isSelected = item.id === selectedTaskId;
              const statusText = item.status === 'sent' ? 'Отправлено' : 'Черновик';
              const statusColor =
                item.status === 'sent' ? 'text-emerald-400' : 'text-amber-400';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTask(item.id)}
                  className={`flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3 text-left transition-colors ${
                    isSelected ? 'bg-[#1E1E1E]' : 'hover:bg-[#1A1A1C] active:bg-[#1E1E1E]'
                  }`}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#1E1E1E]">
                    {item.imageDataUrl ? (
                      <img
                        src={item.imageDataUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FileImage className="h-5 w-5 text-zinc-500" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#F4F4F5]">
                      {item.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                      <span className={`font-medium ${statusColor}`}>{statusText}</span>
                      <span aria-hidden="true">·</span>
                      <span className={pMeta.textColor}>{pMeta.label}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {formatShortDateTime(item.sentAt ?? item.createdAt)}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
