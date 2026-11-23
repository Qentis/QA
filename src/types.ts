export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskStatus = 'draft' | 'sent';

export type ActiveTab = 'chat' | 'tasks' | 'settings';

export interface TaskDraft {
  id: string;
  requestId: string;
  status: TaskStatus;
  title: string;
  descr: string;
  priority: Priority;
  boardId: number | null;
  stageId: number | null;
  assigneeId: number | null;
  imageDataUrl?: string;
  imageMimeType?: string;
  imageName?: string;
  uploadedImageUrl?: string;
  attachedToTracker?: boolean;
  remoteId?: number;
  remoteUrl?: string;
  userComment: string;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  imageDataUrl?: string;
  imageName?: string;
  taskId?: string;
  generatedTask?: {
    title: string;
    descr: string;
    priority: Priority;
  };
  createdAt: number;
}

export interface TrackerStage {
  id: number;
  title: string;
  ecat: number; // 1: To do, 2: In progress, 3: Under review, 4: Done
}

export interface TrackerBoard {
  id: number;
  title: string;
  project: string | null;
  stages: TrackerStage[];
}

export interface TrackerPerson {
  id: number;
  name: string;
  email?: string;
  position?: string;
  department?: string;
}

export interface AppSettings {
  baseUrl: string;
  apiToken: string;
  imageUploadUrl: string;
  defaultBoardId: number | null;
  defaultStageId: number | null;
  defaultAssigneeId: number | null;
}

export interface TrackerCache {
  boards: TrackerBoard[];
  people: TrackerPerson[];
  meId: number | null;
  syncedAt: number | null;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
