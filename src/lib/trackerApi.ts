import type {
  GeminiModelId,
  GeminiThinkingLevel,
  Priority,
  TrackerBoard,
  TrackerPerson,
  TrackerStage,
} from '../types';

export interface GeminiAnalyzeResult {
  title: string;
  descr: string;
  priority: Priority;
  modelUsed?: GeminiModelId;
  thinkingLevelUsed?: GeminiThinkingLevel;
}

export class GeminiAnalyzeError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class TrackerApiError extends Error {
  status: number;
  code: string;
  retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function formatTrackerErrorMessage(status: number, code: string, rawMsg?: string, retryAfter?: number): string {
  const codeLower = code.toLowerCase();
  if (codeLower === 'key_read_only') {
    return '403 key_read_only: API-ключ имеет права только на чтение. Включите разрешение «Allow changes» в настройках ключа.';
  }
  if (codeLower === 'bad_request') {
    return `400 bad_request: ${rawMsg || 'Проверьте обязательные поля (доска, колонка, заголовок).'}`;
  }
  if (codeLower === 'not_allowed') {
    return '403 not_allowed: Нет прав на создание или изменение задач на выбранной доске.';
  }
  if (codeLower === 'rate_limited') {
    const waitHint = retryAfter ? ` Повторите через ${retryAfter} сек.` : '';
    return `429 rate_limited: Превышен лимит запросов к API.${waitHint}`;
  }
  if (codeLower === 'request_id_reused') {
    return '409 request_id_reused: Этот request_id уже использован для другой задачи.';
  }
  if (codeLower === 'topic_not_in_api') {
    return '403 topic_not_in_api: Этот метод недоступен для внешнего API-ключа.';
  }
  if (codeLower === 'key_company_mismatch') {
    return '403 key_company_mismatch: Ключ относится к другой компании.';
  }
  if (codeLower === 'stage_done') {
    return '400 stage_done: Новую задачу нельзя создать в колонке проверки или завершения (ecat 3 или 4). Выберите колонку «К выполнению» или «В работе».';
  }
  if (codeLower === 'board_archived') {
    return '400 board_archived: Выбранная доска находится в архиве.';
  }
  if (codeLower === 'key_unknown') {
    return '401 key_unknown: Ключ не найден (удалён или выпущен на другом сервере Mira).';
  }
  if (codeLower === 'key_expired') {
    return '401 key_expired: Срок действия API-ключа истёк. Создайте новый ключ в профиле.';
  }
  if (codeLower === 'signature_invalid') {
    return '401 signature_invalid: Неверная подпись запроса. Проверьте, что файл .pem скопирован полностью.';
  }
  if (codeLower === 'ts_out_of_window') {
    return `401 ts_out_of_window: Время на сервере/устройстве расходится с сервером Mira (${rawMsg || ''}).`;
  }
  if (codeLower === 'invalid_token') {
    return '401 invalid_token: Токен не принят. Для внешнего API Mira используйте файл ключа .pem (или загрузите его кнопкой в Настройках).';
  }
  if (codeLower === 'file_too_large') {
    return '413 file_too_large: Размер скриншота превышает лимит сервера Mira.';
  }
  if (codeLower === 'sha256_mismatch' || codeLower === 'files_mismatch') {
    return `400 ${code}: Контрольная сумма или размер файла не совпали при передаче.`;
  }
  if (codeLower === 'bad_file' || codeLower === 'unsupported_file' || codeLower === 'invalid_file') {
    return `400 ${code}: ${rawMsg || 'Неподдерживаемый формат файла или повреждённое изображение.'}`;
  }
  if (codeLower === 'bad_payload') {
    return `400 bad_payload: ${rawMsg || 'Некорректное тело или заголовки multipart-запроса.'}`;
  }
  if (codeLower === 'board_not_found') {
    return '400 board_not_found: Выбранная доска не найдена или недоступна. Обновите списки в настройках.';
  }
  if (codeLower === 'stage_not_found') {
    return '400 stage_not_found: Выбранная колонка не найдена на доске. Обновите списки в настройках.';
  }
  if (codeLower === 'person_not_found') {
    return '400 person_not_found: Выбранный исполнитель не найден в компании.';
  }
  if (status === 401 || codeLower === 'unauthorized') {
    return `${status} unauthorized: Неверный или просроченный API-ключ трекера.`;
  }
  if (status === 404 || codeLower === 'not_found') {
    return '404 not_found: Эндпоинт не найден или API-ключ недействителен. Проверьте URL API и токен.';
  }
  if (rawMsg) {
    return `${status} ${code}: ${rawMsg}`;
  }
  return `Ошибка API трекера (${status} ${code})`;
}

async function callTrackerProxy(params: {
  baseUrl: string;
  token: string;
  endpoint: 'task_api_board_get' | 'company_api_people_get' | 'task_api_create_set';
  method?: 'GET' | 'POST';
  payload?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
  attachment?: {
    imageBase64: string;
    mimeType?: string;
    fileName?: string;
  };
}): Promise<Record<string, unknown>> {
  const resp = await fetch('/api/tracker/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  const errorCode =
    (typeof data.error === 'string' && data.error) ||
    (typeof data.code === 'string' && data.code) ||
    '';
  const retryAfter = typeof data.retry_after === 'number' ? data.retry_after : undefined;
  const rawMsg =
    (typeof data.message === 'string' && data.message) ||
    (typeof data.mes === 'string' && data.mes) ||
    (typeof data.detail === 'string' && data.detail) ||
    (typeof data.raw === 'string' && data.raw) ||
    undefined;

  if (!resp.ok || data.ok === false || (errorCode && !data.boards && !data.people && !data.id && !data.url)) {
    const code = errorCode || `http_${resp.status}`;
    throw new TrackerApiError(
      resp.status,
      code,
      formatTrackerErrorMessage(resp.status, code, rawMsg, retryAfter),
      retryAfter
    );
  }

  return data;
}

export async function analyzeScreenshotWithGemini(params: {
  imageBase64?: string;
  mimeType?: string;
  comment: string;
  model?: GeminiModelId;
  thinkingLevel?: GeminiThinkingLevel;
}): Promise<GeminiAnalyzeResult> {
  const resp = await fetch('/api/gemini/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    const code = typeof data.error === 'string' ? data.error : `http_${resp.status}`;
    const msg =
      (typeof data.message === 'string' && data.message) ||
      `Ошибка Gemini (${resp.status})`;
    throw new GeminiAnalyzeError(resp.status, code, msg);
  }

  const validPriorities = new Set<Priority>(['low', 'normal', 'high', 'urgent']);
  const priority = validPriorities.has(data.priority as Priority)
    ? (data.priority as Priority)
    : 'normal';

  return {
    title: String(data.title || '[UI]: Проблема на скриншоте'),
    descr: String(data.descr || ''),
    priority,
    modelUsed: typeof data.modelUsed === 'string' ? (data.modelUsed as GeminiModelId) : undefined,
    thinkingLevelUsed:
      typeof data.thinkingLevelUsed === 'string'
        ? (data.thinkingLevelUsed as GeminiThinkingLevel)
        : undefined,
  };
}

function normalizeBoards(raw: Record<string, unknown>): TrackerBoard[] {
  const candidate =
    (Array.isArray(raw.boards) && raw.boards) ||
    (Array.isArray(raw.items) && raw.items) ||
    (Array.isArray(raw.data) && raw.data) ||
    (Array.isArray(raw) && raw) ||
    [];

  return candidate
    .map((item): TrackerBoard | null => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const id = Number(obj.id);
      if (!Number.isFinite(id)) return null;

      const rawStages = Array.isArray(obj.stages)
        ? obj.stages
        : Array.isArray(obj.columns)
          ? obj.columns
          : [];

      const stages: TrackerStage[] = rawStages
        .map((st): TrackerStage | null => {
          if (!st || typeof st !== 'object') return null;
          const s = st as Record<string, unknown>;
          const sid = Number(s.id);
          if (!Number.isFinite(sid)) return null;
          return {
            id: sid,
            title: String(s.title || s.name || `Колонка #${sid}`),
            ecat: Number.isFinite(Number(s.ecat)) ? Number(s.ecat) : 1,
          };
        })
        .filter((s): s is TrackerStage => s !== null);

      const projectObj = obj.project && typeof obj.project === 'object' ? (obj.project as Record<string, unknown>) : null;
      const project =
        typeof obj.project === 'string'
          ? obj.project
          : projectObj
            ? String(projectObj.title || projectObj.name || '')
            : null;

      return {
        id,
        title: String(obj.title || obj.name || `Доска #${id}`),
        project: project || null,
        stages,
      };
    })
    .filter((b): b is TrackerBoard => b !== null);
}

function normalizePeople(raw: Record<string, unknown>): {
  people: TrackerPerson[];
  meId: number | null;
  nextCursor: string | null;
} {
  const candidate =
    (Array.isArray(raw.people) && raw.people) ||
    (Array.isArray(raw.users) && raw.users) ||
    (Array.isArray(raw.items) && raw.items) ||
    (Array.isArray(raw.data) && raw.data) ||
    (Array.isArray(raw) && raw) ||
    [];

  const people: TrackerPerson[] = candidate
    .map((item): TrackerPerson | null => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const id = Number(obj.id);
      if (!Number.isFinite(id)) return null;

      const depts = Array.isArray(obj.departments) ? obj.departments : [];
      const firstDept =
        depts.length > 0 && depts[0] && typeof depts[0] === 'object'
          ? (depts[0] as Record<string, unknown>)
          : null;

      return {
        id,
        name: String(obj.name || obj.full_name || obj.title || `Сотрудник #${id}`),
        email: typeof obj.email === 'string' ? obj.email : undefined,
        position:
          (typeof obj.position === 'string' && obj.position) ||
          (firstDept && typeof firstDept.position === 'string' ? firstDept.position : undefined),
        department:
          (firstDept && typeof firstDept.name === 'string' ? firstDept.name : undefined) ||
          (typeof obj.department === 'string' ? obj.department : undefined),
      };
    })
    .filter((p): p is TrackerPerson => p !== null);

  const meId = Number.isFinite(Number(raw.me)) ? Number(raw.me) : null;
  const nextCursor = typeof raw.next_cursor === 'string' && raw.next_cursor ? raw.next_cursor : null;

  return { people, meId, nextCursor };
}

export async function fetchBoardsAndPeople(baseUrl: string, token: string): Promise<{
  boards: TrackerBoard[];
  people: TrackerPerson[];
  meId: number | null;
}> {
  const boardsRaw = await callTrackerProxy({
    baseUrl,
    token,
    endpoint: 'task_api_board_get',
    method: 'GET',
  });
  const boards = normalizeBoards(boardsRaw);

  const allPeople: TrackerPerson[] = [];
  const seenIds = new Set<number>();
  let meId: number | null = null;
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const peopleRaw = await callTrackerProxy({
      baseUrl,
      token,
      endpoint: 'company_api_people_get',
      method: 'GET',
      query: {
        limit: 200,
        ...(cursor ? { cursor } : {}),
      },
    });
    const parsed = normalizePeople(peopleRaw);
    if (meId === null && parsed.meId !== null) {
      meId = parsed.meId;
    }
    for (const person of parsed.people) {
      if (!seenIds.has(person.id)) {
        seenIds.add(person.id);
        allPeople.push(person);
      }
    }
    cursor = parsed.nextCursor ?? undefined;
    pageCount += 1;
  } while (cursor && pageCount < 20);

  return { boards, people: allPeople, meId };
}

export async function uploadScreenshotImage(params: {
  uploadUrl: string;
  imageDataUrl: string;
  mimeType?: string;
  fileName?: string;
}): Promise<string> {
  const resp = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploadUrl: params.uploadUrl,
      imageBase64: params.imageDataUrl,
      mimeType: params.mimeType || 'image/png',
      fileName: params.fileName || 'screenshot.png',
    }),
  });

  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok || typeof data.url !== 'string') {
    throw new Error(
      (typeof data.message === 'string' && data.message) ||
        `Не удалось загрузить скриншот (${resp.status})`
    );
  }
  return data.url;
}

export async function createTrackerTask(params: {
  baseUrl: string;
  token: string;
  request_id: string;
  board_id: number;
  stage_id: number;
  title: string;
  descr: string;
  assignee_id?: number | null;
  priority: Priority;
  attachment?: {
    imageDataUrl: string;
    mimeType?: string;
    fileName?: string;
  };
}): Promise<{ id?: number; url?: string; created: boolean; attachmentsCount: number }> {
  const payload: Record<string, unknown> = {
    request_id: params.request_id,
    board_id: params.board_id,
    stage_id: params.stage_id,
    title: params.title,
    descr: params.descr,
    priority: params.priority,
  };

  if (typeof params.assignee_id === 'number' && Number.isFinite(params.assignee_id)) {
    payload.assignee_id = params.assignee_id;
  }

  const data = await callTrackerProxy({
    baseUrl: params.baseUrl,
    token: params.token,
    endpoint: 'task_api_create_set',
    method: 'POST',
    payload,
    attachment: params.attachment
      ? {
          imageBase64: params.attachment.imageDataUrl,
          mimeType: params.attachment.mimeType,
          fileName: params.attachment.fileName,
        }
      : undefined,
  });

  const taskObj =
    data.task && typeof data.task === 'object' ? (data.task as Record<string, unknown>) : data;

  const id = Number.isFinite(Number(taskObj.id)) ? Number(taskObj.id) : undefined;
  const url = typeof taskObj.url === 'string' ? taskObj.url : undefined;
  const created = Boolean(data.created ?? taskObj.created ?? (id || url));
  const rawAttachments = Array.isArray(taskObj.attachments)
    ? taskObj.attachments
    : Array.isArray(data.attachments)
      ? data.attachments
      : [];

  return { id, url, created, attachmentsCount: rawAttachments.length };
}

export async function attachScreenshotToTrackerTask(params: {
  baseUrl: string;
  token: string;
  taskId: number;
  requestId: string;
  imageDataUrl: string;
  mimeType?: string;
  fileName?: string;
}): Promise<void> {
  const resp = await fetch('/api/tracker/attach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: params.baseUrl,
      token: params.token,
      taskId: params.taskId,
      requestId: params.requestId,
      imageBase64: params.imageDataUrl,
      mimeType: params.mimeType || 'image/png',
      fileName: params.fileName || 'screenshot.png',
    }),
  });

  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  const errorCode =
    (typeof data.error === 'string' && data.error) ||
    (typeof data.code === 'string' && data.code) ||
    '';
  const retryAfter = typeof data.retry_after === 'number' ? data.retry_after : undefined;
  const rawMsg =
    (typeof data.message === 'string' && data.message) ||
    (typeof data.mes === 'string' && data.mes) ||
    (typeof data.detail === 'string' && data.detail) ||
    (typeof data.raw === 'string' && data.raw) ||
    undefined;

  if (!resp.ok || data.ok === false || errorCode) {
    const code = errorCode || `http_${resp.status}`;
    throw new TrackerApiError(
      resp.status,
      code,
      formatTrackerErrorMessage(resp.status, code, rawMsg, retryAfter),
      retryAfter
    );
  }
}
