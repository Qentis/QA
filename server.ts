import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_TRACKER_ENDPOINTS = new Set([
  'task_api_board_get',
  'company_api_people_get',
  'task_api_create_set',
]);

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

const QA_SYSTEM_INSTRUCTION = `Ты — ассистент QA-инженера. На вход ты получаешь скриншот интерфейса и короткое описание проблемы от тестировщика. Твоя задача — без вступлений и лишних объяснений сразу вернуть строго валидный JSON с полями:
- "title": заголовок задачи в формате "[Раздел / Подраздел]: [Краткая суть проблемы или улучшения]"
- "descr": подробное описание в Markdown (1-2 абзаца строго по фактам с экрана и словам автора, плюс блок "Предлагаю:" с вариантом решения, если уместно). Никаких домыслов и придуманных технических причин, если автор о них не написал. Если баг связан с правами доступа или безопасностью, добавь [Security] в начало title.
- "priority": одно из значений ("low", "normal", "high", "urgent").`;

const ALLOWED_GEMINI_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);

type RequestedThinkingLevel = 'AUTO' | 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

function resolveGeminiModel(rawModel: unknown): 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' {
  if (typeof rawModel === 'string' && ALLOWED_GEMINI_MODELS.has(rawModel)) {
    return rawModel as 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  }
  return 'gemini-4-hydrogen';
}

function resolveThinkingLevel(
  model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite',
  rawLevel: unknown
): { sdkLevel?: ThinkingLevel; effectiveLabel: RequestedThinkingLevel } {
  const valid = new Set<RequestedThinkingLevel>([
    'AUTO',
    'MINIMAL',
    'LOW',
    'MEDIUM',
    'HIGH',
    'XHIGH',
  ]);
  const requested: RequestedThinkingLevel =
    typeof rawLevel === 'string' && valid.has(rawLevel.toUpperCase() as RequestedThinkingLevel)
      ? (rawLevel.toUpperCase() as RequestedThinkingLevel)
      : 'AUTO';

  if (requested === 'AUTO') {
    return { sdkLevel: undefined, effectiveLabel: 'AUTO' };
  }

  if (model === 'gemini-4-hydrogen') {
    if (requested === 'MINIMAL' || requested === 'LOW') {
      return { sdkLevel: ThinkingLevel.LOW, effectiveLabel: 'LOW' };
    }
    if (requested === 'MEDIUM') {
      return { sdkLevel: ThinkingLevel.MEDIUM, effectiveLabel: 'MEDIUM' };
    }
    if (requested === 'XHIGH') {
      return { sdkLevel: ThinkingLevel.XHIGH, effectiveLabel: 'XHIGH' };
    }
    return { sdkLevel: ThinkingLevel.HIGH, effectiveLabel: 'HIGH' };
  }

  // gemini-3.1-flash-lite supports MINIMAL, LOW, MEDIUM, HIGH (not XHIGH)
  if (requested === 'MINIMAL') {
    return { sdkLevel: ThinkingLevel.MINIMAL, effectiveLabel: 'MINIMAL' };
  }
  if (requested === 'LOW') {
    return { sdkLevel: ThinkingLevel.LOW, effectiveLabel: 'LOW' };
  }
  if (requested === 'MEDIUM') {
    return { sdkLevel: ThinkingLevel.MEDIUM, effectiveLabel: 'MEDIUM' };
  }
  return { sdkLevel: ThinkingLevel.HIGH, effectiveLabel: 'HIGH' };
}

function parseGeminiApiError(err: unknown): {
  httpStatus: number;
  apiStatus: string;
  rawMessage: string;
} {
  const errObj = err && typeof err === 'object' ? (err as Record<string, unknown>) : null;
  let httpStatus =
    errObj && typeof errObj.status === 'number' && Number.isFinite(errObj.status)
      ? errObj.status
      : 500;
  let rawMessage =
    err instanceof Error ? err.message : 'Ошибка при обращении к Gemini API';
  let apiStatus = '';

  const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error) {
        if (typeof parsed.error.code === 'number') httpStatus = parsed.error.code;
        if (typeof parsed.error.status === 'string') apiStatus = parsed.error.status;
        if (typeof parsed.error.message === 'string') rawMessage = parsed.error.message;
      }
    } catch {
      // Keep original rawMessage
    }
  }

  return { httpStatus, apiStatus, rawMessage };
}

function isTransientGeminiError(info: {
  httpStatus: number;
  apiStatus: string;
  rawMessage: string;
}): boolean {
  const msgLower = info.rawMessage.toLowerCase();
  return (
    info.httpStatus === 503 ||
    info.httpStatus === 429 ||
    info.apiStatus === 'UNAVAILABLE' ||
    info.apiStatus === 'RESOURCE_EXHAUSTED' ||
    msgLower.includes('high demand') ||
    msgLower.includes('overloaded') ||
    msgLower.includes('unavailable') ||
    msgLower.includes('econnreset') ||
    msgLower.includes('etimedout') ||
    msgLower.includes('fetch failed')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isPrivateOrRestrictedIp(ip: string, allowCgnat = false): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (!allowCgnat && a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT / Tailscale / VPN Fake-IP
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
    if (normalized.startsWith('fe80')) return true; // link-local
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      if (net.isIPv4(mapped)) {
        return isPrivateOrRestrictedIp(mapped, allowCgnat);
      }
    }
    return false;
  }

  return true;
}

async function validateExternalUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Некорректный формат URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Разрешены только протоколы http и https.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Локальные и внутренние адреса не поддерживаются.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname, false)) {
      throw new Error('Частные и зарезервированные IP-адреса запрещены.');
    }
    return parsed;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length || records.some((r) => isPrivateOrRestrictedIp(r.address, true))) {
      throw new Error('Целевой хост указывает на запрещённый IP-адрес.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('запрещённый')) {
      throw err;
    }
    throw new Error(`Не удалось разрешить DNS для хоста ${hostname}.`);
  }

  return parsed;
}

async function parseUpstreamResponse(resp: globalThis.Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function resolveTopicUrl(baseStr: string): string {
  const clean = baseStr.replace(/\/+$/, '');
  if (clean.endsWith('/topic')) {
    return clean;
  }
  const parsed = new URL(clean);
  if (parsed.pathname === '' || parsed.pathname === '/') {
    return `${clean}/api/v1/topic`;
  }
  return `${clean}/topic`;
}

function tryCreateEd25519PrivateKey(rawToken: string): crypto.KeyObject | null {
  const trimmed = rawToken.trim();
  const pemMatch = trimmed.match(
    /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/
  );
  if (pemMatch) {
    const label = pemMatch[1].trim();
    const base64Body = pemMatch[2].replace(/\s+/g, '');
    const lines = base64Body.match(/.{1,64}/g) ?? [];
    const normalizedPem = `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
    return crypto.createPrivateKey({ key: normalizedPem, format: 'pem' });
  }

  // Also support raw base64 PKCS8 DER private key (without BEGIN/END headers),
  // as long as it is not a 3-segment JWT token.
  if (!trimmed.includes('.') && /^[A-Za-z0-9+/=\s]{40,}$/.test(trimmed)) {
    try {
      const compact = trimmed.replace(/\s+/g, '');
      const lines = compact.match(/.{1,64}/g) ?? [];
      const wrapped = `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
      return crypto.createPrivateKey({ key: wrapped, format: 'pem' });
    } catch {
      return null;
    }
  }

  return null;
}

function buildSignedTopicRequest(
  privateKey: crypto.KeyObject,
  topic: string,
  paramsObj: Record<string, unknown>
): { headers: Record<string, string>; body: string } {
  const publicKey = crypto.createPublicKey(privateKey);
  const spkiBase64 = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');

  const ts = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const paramsStr = JSON.stringify(paramsObj);
  const digest = crypto
    .createHash('sha256')
    .update(Buffer.from(paramsStr, 'utf8'))
    .digest('base64');
  const canon = ['mira-rest', 'v1', nonce, String(ts), topic, digest].join('\n');
  const signature = crypto
    .sign(null, Buffer.from(canon, 'utf8'), privateKey)
    .toString('base64');

  const body =
    '{"topic":' +
    JSON.stringify(topic) +
    ',"ts":' +
    ts +
    ',"nonce":' +
    JSON.stringify(nonce) +
    ',"params":' +
    paramsStr +
    ',"signature":' +
    JSON.stringify(signature) +
    '}';

  return {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Api-Public-Key': spkiBase64,
    },
    body,
  };
}

interface PreparedUploadFile {
  name: string;
  size: number;
  sha256: string;
  buffer: Buffer;
  mimeType: string;
}

function prepareImageUpload(input: {
  imageBase64: string;
  mimeType?: string;
  fileName?: string;
}): PreparedUploadFile {
  const dataUrlMimeMatch = input.imageBase64.match(/^data:([^;]+);base64,/i);
  const rawMime = (input.mimeType || dataUrlMimeMatch?.[1] || 'image/png').toLowerCase();
  const cleanMime = ALLOWED_IMAGE_MIME_TYPES.has(rawMime)
    ? rawMime === 'image/jpg'
      ? 'image/jpeg'
      : rawMime
    : 'image/png';

  const ext = cleanMime === 'image/jpeg' ? 'jpg' : cleanMime.split('/')[1] || 'png';
  const strippedBaseName = (input.fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  const stem = strippedBaseName && /[a-zA-Z0-9]/.test(strippedBaseName) ? strippedBaseName : 'screenshot';
  const safeName = `${stem}.${ext}`;

  const strippedBase64 = input.imageBase64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(strippedBase64, 'base64');
  if (buffer.length === 0) {
    throw new Error('EMPTY_IMAGE');
  }
  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error('IMAGE_TOO_LARGE');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    name: safeName,
    size: buffer.length,
    sha256,
    buffer,
    mimeType: cleanMime,
  };
}

function buildMultipartTopicRequest(params: {
  privateKey: crypto.KeyObject | null;
  rawToken: string;
  topic: string;
  paramsObj: Record<string, unknown>;
  files: PreparedUploadFile[];
}): { headers: Record<string, string>; body: Uint8Array<ArrayBuffer> } {
  const { privateKey, rawToken, topic, paramsObj, files } = params;
  const manifest = files.map((f) => ({
    name: f.name,
    size: f.size,
    sha256: f.sha256,
  }));

  const fullParams: Record<string, unknown> = {
    ...paramsObj,
    files: manifest,
  };

  let metaJson: string;
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (privateKey) {
    const signed = buildSignedTopicRequest(privateKey, topic, fullParams);
    metaJson = signed.body;
    headers['X-Api-Public-Key'] = signed.headers['X-Api-Public-Key'];
  } else {
    metaJson = JSON.stringify({
      topic,
      params: fullParams,
    });
    headers['Authorization'] = `Bearer ${rawToken.trim()}`;
  }

  const boundary = `mira-${crypto.randomUUID().replace(/-/g, '')}`;
  const chunks: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="meta"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${metaJson}\r\n`,
      'utf8'
    ),
  ];

  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`,
        'utf8'
      )
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  const combined = Buffer.concat(chunks);
  const body = new Uint8Array(combined.length);
  body.set(combined);

  headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
  headers['Content-Length'] = String(body.byteLength);

  return { headers, body };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // 1. Gemini Multimodal QA Bug Report Generation
  app.post('/api/gemini/analyze', async (req: Request, res: Response) => {
    let selectedModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' = 'gemini-4-hydrogen';
    try {
      const { imageBase64, mimeType, comment, model, thinkingLevel } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        comment?: string;
        model?: string;
        thinkingLevel?: string;
      };

      selectedModel = resolveGeminiModel(model);
      const { sdkLevel, effectiveLabel } = resolveThinkingLevel(selectedModel, thinkingLevel);

      const cleanComment = typeof comment === 'string' ? comment.trim() : '';
      const hasImage = typeof imageBase64 === 'string' && imageBase64.length > 0;

      if (!hasImage && !cleanComment) {
        res.status(400).json({
          error: 'bad_request',
          message: 'Прикрепите скриншот или введите описание проблемы.',
        });
        return;
      }

      const parts: Array<
        { inlineData: { mimeType: string; data: string } } | { text: string }
      > = [];

      if (hasImage) {
        const normalizedMime =
          typeof mimeType === 'string' && ALLOWED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase())
            ? mimeType.toLowerCase() === 'image/jpg'
              ? 'image/jpeg'
              : mimeType.toLowerCase()
            : 'image/png';

        const strippedBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
          inlineData: {
            mimeType: normalizedMime,
            data: strippedBase64,
          },
        });
      }

      parts.push({
        text: cleanComment
          ? `Комментарий тестировщика: ${cleanComment}`
          : 'Проанализируй прикреплённый скриншот интерфейса и опиши обнаруженную проблему строго по видимым фактам.',
      });

      const ai = getGeminiClient();
      const requestConfig = {
        systemInstruction: QA_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        ...(sdkLevel ? { thinkingConfig: { thinkingLevel: sdkLevel } } : {}),
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description:
                'Заголовок задачи в формате "[Раздел / Подраздел]: [Краткая суть]". Добавь [Security] в начало, если связано с правами доступа или безопасностью.',
            },
            descr: {
              type: Type.STRING,
              description:
                'Подробное описание в Markdown (1-2 абзаца по фактам + блок "Предлагаю:" если уместно).',
            },
            priority: {
              type: Type.STRING,
              description: 'Приоритет задачи: low, normal, high или urgent.',
              enum: ['low', 'normal', 'high', 'urgent'],
            },
          },
          required: ['title', 'descr', 'priority'],
        },
      };

      const MAX_ATTEMPTS = 3;
      let response: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
      let lastErr: unknown = null;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: selectedModel,
            contents: { parts },
            config: requestConfig,
          });
          break;
        } catch (err) {
          lastErr = err;
          const info = parseGeminiApiError(err);
          const shouldRetry = attempt < MAX_ATTEMPTS - 1 && isTransientGeminiError(info);
          if (!shouldRetry) {
            throw err;
          }
          const backoffMs = 900 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          await sleep(backoffMs);
        }
      }

      if (!response) {
        throw lastErr ?? new Error('Не удалось получить ответ от Gemini API');
      }

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({
          error: 'empty_model_response',
          message: 'Gemini вернул пустой ответ. Нажмите «Повторить запрос».',
        });
        return;
      }

      const cleanedJson = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();

      const parsed = JSON.parse(cleanedJson) as {
        title?: string;
        descr?: string;
        priority?: string;
      };

      const validPriorities = new Set(['low', 'normal', 'high', 'urgent']);
      const priority = validPriorities.has(String(parsed.priority))
        ? parsed.priority
        : 'normal';

      res.json({
        title: String(parsed.title || '[UI]: Проблема на скриншоте').slice(0, 500),
        descr: String(parsed.descr || cleanComment || ''),
        priority,
        modelUsed: selectedModel,
        thinkingLevelUsed: effectiveLabel,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'GEMINI_API_KEY_MISSING') {
        res.status(500).json({
          error: 'gemini_key_missing',
          message: 'На сервере не задан GEMINI_API_KEY. Добавьте ключ в Settings > Secrets.',
        });
        return;
      }

      const { httpStatus, apiStatus, rawMessage } = parseGeminiApiError(err);

      if (
        httpStatus === 503 ||
        apiStatus === 'UNAVAILABLE' ||
        rawMessage.toLowerCase().includes('high demand')
      ) {
        const modelTitle =
          selectedModel === 'gemini-3.1-flash-lite' ? 'Gemini 3.1 Flash Lite' : 'Gemini 4 Hydrogen';
        res.status(503).json({
          error: 'model_overloaded',
          message: `Модель ${modelTitle} временно перегружена (503). Повторите запрос или переключитесь на другую модель.`,
        });
        return;
      }

      if (httpStatus === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
        res.status(429).json({
          error: 'rate_limited',
          message: 'Превышен лимит запросов к Gemini API (429). Подождите немного и повторите запрос.',
        });
        return;
      }

      if (httpStatus === 403 || apiStatus === 'PERMISSION_DENIED') {
        res.status(403).json({
          error: 'permission_denied',
          message: 'Доступ к Gemini API отклонён (403). Проверьте GEMINI_API_KEY в Settings > Secrets.',
        });
        return;
      }

      if (httpStatus === 404 || apiStatus === 'NOT_FOUND') {
        res.status(404).json({
          error: 'model_not_found',
          message: `Модель ${selectedModel} временно недоступна (404). Попробуйте выбрать другую модель.`,
        });
        return;
      }

      const status = httpStatus >= 400 && httpStatus < 600 ? httpStatus : 500;
      res.status(status).json({
        error: 'gemini_error',
        message: rawMessage,
      });
    }
  });

  // 2. SSRF-safe Tracker API Proxy (HRMira /api/v1/topic with Ed25519 .pem signing or Bearer JWT, JSON or signed multipart)
  app.post('/api/tracker/proxy', async (req: Request, res: Response) => {
    try {
      const { baseUrl, endpoint, token, payload, query, attachment } = req.body as {
        baseUrl?: string;
        endpoint?: string;
        method?: 'GET' | 'POST';
        token?: string;
        payload?: Record<string, unknown>;
        query?: Record<string, string | number | boolean | undefined>;
        attachment?: {
          imageBase64?: string;
          mimeType?: string;
          fileName?: string;
        };
      };

      if (!endpoint || !ALLOWED_TRACKER_ENDPOINTS.has(endpoint)) {
        res.status(400).json({
          error: 'invalid_endpoint',
          message: `Неизвестный или недопустимый эндпоинт: ${String(endpoint || '')}`,
        });
        return;
      }

      if (!baseUrl || typeof baseUrl !== 'string') {
        res.status(400).json({
          error: 'missing_base_url',
          message: 'Укажите базовый URL API трекера в настройках.',
        });
        return;
      }

      if (!token || typeof token !== 'string' || !token.trim()) {
        res.status(400).json({
          error: 'missing_token',
          message: 'Укажите API-ключ трекера (.pem или Bearer-токен) в настройках.',
        });
        return;
      }

      const validatedBase = await validateExternalUrl(baseUrl);
      const topicUrl = resolveTopicUrl(validatedBase.toString());

      const paramsObj: Record<string, unknown> = {};
      if (query && typeof query === 'object') {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null && v !== '') {
            paramsObj[k] = v;
          }
        }
      }
      if (payload && typeof payload === 'object') {
        Object.assign(paramsObj, payload);
      }

      let privateKey: crypto.KeyObject | null = null;
      try {
        privateKey = tryCreateEd25519PrivateKey(token);
      } catch {
        res.status(400).json({
          error: 'invalid_pem_key',
          message:
            'Не удалось прочитать закрытый ключ .pem. Убедитесь, что вставлен полный блок -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----.',
        });
        return;
      }

      const hasAttachment =
        endpoint === 'task_api_create_set' &&
        attachment &&
        typeof attachment.imageBase64 === 'string' &&
        attachment.imageBase64.length > 0;

      let headers: Record<string, string>;
      let body: string | Uint8Array<ArrayBuffer>;

      if (hasAttachment && attachment.imageBase64) {
        let preparedFile: PreparedUploadFile;
        try {
          preparedFile = prepareImageUpload({
            imageBase64: attachment.imageBase64,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName,
          });
        } catch (imgErr) {
          const code = imgErr instanceof Error ? imgErr.message : 'BAD_IMAGE';
          res.status(400).json({
            error: code === 'IMAGE_TOO_LARGE' ? 'file_too_large' : 'empty_image',
            message:
              code === 'IMAGE_TOO_LARGE'
                ? 'Размер скриншота превышает допустимый лимит (20 МБ).'
                : 'Файл скриншота пустой или повреждён.',
          });
          return;
        }

        if (
          typeof paramsObj.request_id !== 'string' ||
          !/^[A-Za-z0-9_-]{1,64}$/.test(paramsObj.request_id)
        ) {
          paramsObj.request_id = crypto.randomUUID();
        }

        const multipart = buildMultipartTopicRequest({
          privateKey,
          rawToken: token,
          topic: endpoint,
          paramsObj,
          files: [preparedFile],
        });
        headers = multipart.headers;
        body = multipart.body;
      } else if (privateKey) {
        const signed = buildSignedTopicRequest(privateKey, endpoint, paramsObj);
        headers = signed.headers;
        body = signed.body;
      } else {
        headers = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${token.trim()}`,
        };
        body = JSON.stringify({
          topic: endpoint,
          params: paramsObj,
        });
      }

      const upstream = await fetch(topicUrl, {
        method: 'POST',
        headers,
        body,
      });

      const data = await parseUpstreamResponse(upstream);
      res.status(upstream.status).json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка соединения с API трекера';
      res.status(502).json({
        error: 'proxy_error',
        message,
      });
    }
  });

  // 2b. Attach screenshot directly to an existing Mira task via task_api_attach_set (multipart meta + file)
  app.post('/api/tracker/attach', async (req: Request, res: Response) => {
    try {
      const {
        baseUrl,
        token,
        taskId,
        requestId,
        imageBase64,
        mimeType,
        fileName,
      } = req.body as {
        baseUrl?: string;
        token?: string;
        taskId?: number;
        requestId?: string;
        imageBase64?: string;
        mimeType?: string;
        fileName?: string;
      };

      if (!baseUrl || typeof baseUrl !== 'string') {
        res.status(400).json({
          error: 'missing_base_url',
          message: 'Укажите базовый URL API трекера в настройках.',
        });
        return;
      }

      if (!token || typeof token !== 'string' || !token.trim()) {
        res.status(400).json({
          error: 'missing_token',
          message: 'Укажите API-ключ трекера в настройках.',
        });
        return;
      }

      if (typeof taskId !== 'number' || !Number.isFinite(taskId) || taskId < 1) {
        res.status(400).json({
          error: 'invalid_task_id',
          message: 'Некорректный ID задачи для прикрепления скриншота.',
        });
        return;
      }

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({
          error: 'missing_image',
          message: 'Отсутствуют данные скриншота.',
        });
        return;
      }

      const validatedBase = await validateExternalUrl(baseUrl);
      const topicUrl = resolveTopicUrl(validatedBase.toString());

      let preparedFile: PreparedUploadFile;
      try {
        preparedFile = prepareImageUpload({
          imageBase64,
          mimeType,
          fileName,
        });
      } catch (imgErr) {
        const code = imgErr instanceof Error ? imgErr.message : 'BAD_IMAGE';
        res.status(400).json({
          error: code === 'IMAGE_TOO_LARGE' ? 'file_too_large' : 'empty_image',
          message:
            code === 'IMAGE_TOO_LARGE'
              ? 'Размер скриншота превышает допустимый лимит (20 МБ).'
              : 'Файл скриншота пустой.',
        });
        return;
      }

      let privateKey: crypto.KeyObject | null = null;
      try {
        privateKey = tryCreateEd25519PrivateKey(token);
      } catch {
        res.status(400).json({
          error: 'invalid_pem_key',
          message: 'Не удалось прочитать закрытый ключ .pem.',
        });
        return;
      }

      const paramsObj = {
        task_id: taskId,
        request_id:
          typeof requestId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(requestId)
            ? requestId
            : crypto.randomUUID(),
      };

      const multipart = buildMultipartTopicRequest({
        privateKey,
        rawToken: token,
        topic: 'task_api_attach_set',
        paramsObj,
        files: [preparedFile],
      });

      const upstream = await fetch(topicUrl, {
        method: 'POST',
        headers: multipart.headers,
        body: multipart.body,
      });

      const data = await parseUpstreamResponse(upstream);
      res.status(upstream.status).json(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Ошибка загрузки скриншота в трекер';
      res.status(502).json({
        error: 'attach_proxy_error',
        message,
      });
    }
  });

  // 3. SSRF-safe Custom Image Upload Proxy
  app.post('/api/upload-image', async (req: Request, res: Response) => {
    try {
      const { uploadUrl, imageBase64, mimeType, fileName, token } = req.body as {
        uploadUrl?: string;
        imageBase64?: string;
        mimeType?: string;
        fileName?: string;
        token?: string;
      };

      if (!uploadUrl || typeof uploadUrl !== 'string') {
        res.status(400).json({
          error: 'missing_upload_url',
          message: 'URL сервера загрузки картинок не указан.',
        });
        return;
      }

      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({
          error: 'missing_image',
          message: 'Отсутствуют данные изображения.',
        });
        return;
      }

      const validatedUrl = await validateExternalUrl(uploadUrl);
      const cleanMime =
        mimeType && ALLOWED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase())
          ? mimeType.toLowerCase()
          : 'image/png';
      const ext = cleanMime.split('/')[1] || 'png';
      const safeName = (fileName || `screenshot.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_');

      const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: cleanMime });

      const formData = new FormData();
      formData.append('file', blob, safeName);

      const headers: Record<string, string> = {};
      if (token && token.trim()) {
        headers['Authorization'] = `Bearer ${token.trim()}`;
      }

      const upstream = await fetch(validatedUrl.toString(), {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = (await parseUpstreamResponse(upstream)) as Record<string, unknown>;
      if (!upstream.ok) {
        res.status(upstream.status).json({
          error: 'upload_failed',
          message:
            (typeof data.message === 'string' && data.message) ||
            (typeof data.error === 'string' && data.error) ||
            `Сервер загрузки вернул статус ${upstream.status}`,
          details: data,
        });
        return;
      }

      const nestedData =
        data.data && typeof data.data === 'object' ? (data.data as Record<string, unknown>) : null;
      const resolvedUrl =
        (typeof data.url === 'string' && data.url) ||
        (typeof data.link === 'string' && data.link) ||
        (typeof data.file_url === 'string' && data.file_url) ||
        (nestedData && typeof nestedData.url === 'string' && nestedData.url) ||
        (nestedData && typeof nestedData.link === 'string' && nestedData.link) ||
        null;

      if (!resolvedUrl) {
        res.status(502).json({
          error: 'invalid_upload_response',
          message: 'Сервер загрузки не вернул поле url в JSON-ответе.',
          details: data,
        });
        return;
      }

      res.json({ url: resolvedUrl });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка загрузки изображения';
      res.status(502).json({
        error: 'upload_proxy_error',
        message,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QA BugSnap server listening on http://localhost:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
