import type { ApiAdvanced } from '../application/contracts';

export const defaultTimeoutSec = 180;
const reserved = new Set([
  '__proto__', 'constructor', 'prototype', 'model', 'messages', 'prompt', 'stream', 'json_schema', 'response_format',
  'chat_completion_source', 'custom_url', 'custom_include_body', 'custom_include_headers', 'custom_exclude_body',
  'reverse_proxy', 'proxy_password', 'base_url', 'api_key', 'apiKey', 'key', 'headers', 'secret_id', 'secretId',
]);

function parseAdditionalParams(text = ''): Record<string, unknown> {
  if (typeof text !== 'string') throw new Error('附加参数须为 JSON 对象。');
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, (key, value) => {
      if (['__proto__','constructor','prototype'].includes(key) || typeof value === 'number' && !Number.isFinite(value)) throw new Error();
      return value;
    });
  } catch { throw new Error('附加参数须为有效的 JSON 对象。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('附加参数须为 JSON 对象。');
  if (Object.keys(parsed).some(key=>reserved.has(key))) throw new Error('附加参数不能覆盖连接、模型、消息、流式开关或输出格式。');
  return parsed as Record<string, unknown>;
}

export function requestPolicy(value: ApiAdvanced) {
  if (value.timeoutSec !== undefined && (!Number.isInteger(value.timeoutSec) || value.timeoutSec < 5 || value.timeoutSec > 600)) throw new Error('超时秒数须为 5–600 的整数。');
  if (value.retryCount !== undefined && (!Number.isSafeInteger(value.retryCount + 1) || value.retryCount < 0)) throw new Error('失败重试次数须为 0 或正整数。');
  return { timeoutSec: value.timeoutSec ?? defaultTimeoutSec, retryCount: value.retryCount ?? 0 };
}

export function validateAdvanced(value: ApiAdvanced) {
  requestPolicy(value);
  if (value.excludeParams?.some(key=>reserved.has(key))) throw new Error('排除参数不能移除连接、模型、消息、流式开关或输出格式。');
  if (value.temperature != null && (!Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) throw new Error('温度须在 0–2 之间，或留空使用接口默认值。');
  return parseAdditionalParams(value.additionalParams);
}

/** Missing fields keep their current values when another editor changes a preset. */
export function advancedFields(old?: ApiAdvanced, patch?: ApiAdvanced): { advanced?: ApiAdvanced } {
  if (!old && !patch) return {};
  const advanced = { ...old, ...patch };
  validateAdvanced(advanced);
  return { advanced };
}
