import type { ModelProfile } from '../application/contracts';
import { getHostContext } from '../host/host-context';
import { jsonRequestHeaders } from '../host/request-headers';
import { ModelError, withModelAttempts } from './transport';
import { createModelClient, normalizeApiUrl } from './client';

export function createModelSettingsTools(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  return {
    async fetchModels(profile: ModelProfile): Promise<string[]> {
      if (!profile.url?.trim() || !profile.key?.trim()) throw new Error('请先填写API地址和Key。');
      return withModelAttempts(profile, undefined, async signal => {
        const response = await fetchImpl('/api/backends/chat-completions/status', {
          method: 'POST', signal, headers: jsonRequestHeaders(getHostContext()?.getRequestHeaders?.() ?? {}),
          body: JSON.stringify({ chat_completion_source: 'openai', reverse_proxy: normalizeApiUrl(profile.url), proxy_password: profile.key }),
        });
        const raw = await response.text();
        if (!response.ok) throw new ModelError(`拉取模型列表失败（HTTP ${response.status}）。`, response.status, response.status===429?'rate_limit':'http_error');
        let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch { throw new ModelError('模型列表格式无法读取。',response.status,'invalid_json'); }
        const rawNames: unknown[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const names = rawNames.map((item: any) => typeof item === 'string' ? item : item?.id).filter((item: unknown): item is string => Boolean(item)).map(String);
        if (!names.length) throw new ModelError('没有读取到可用模型。',response.status,'empty_response');
        return [...new Set(names)].sort();
      });
    },
    async testConnection(profile: ModelProfile): Promise<void> {
      if (!profile.url || !profile.key || !profile.model) throw new Error('请先填写 API 地址、模型名和 Key。');
      try {
        await createModelClient({ fetchImpl }).generate(profile, [
          { role: 'system', content: 'This is a plain-text connection check. Reply with a short confirmation.' },
          { role: 'user', content: 'Reply with OK.' },
        ], 256);
      } catch (error) {
        if (error instanceof Error && error.message.includes(profile.key)) throw new Error('测试连接失败，请检查 API 配置。');
        throw error;
      }
    },
  };
}
