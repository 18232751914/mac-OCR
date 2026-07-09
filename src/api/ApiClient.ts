/**
 * 文件：src/api/ApiClient.ts
 * 职责：封装渲染进程对远端业务服务的统一调用。所有请求自动从 auth store
 *       读取并携带 access/refresh token，并在响应中同步可能刷新的 token 与
 *       session；遇到 401 自动登出，遇到 403 抛出权限错误。
 * 依赖：@/auth/AuthStore（读取/更新登录态）、@/api/AppDtos（请求/响应类型）、
 *       import.meta.env.VITE_API_URL（服务基地址）
 * 导出：默认对象 { invokeMethod, streamMethod }
 */

import useAuthStore from '@/auth/AuthStore';
import {
  ServiceInvocationRequestDto,
  ServiceInvocationResponseEnvelopeDto,
  ServiceStreamingRequestDto,
} from './AppDtos';

export interface ApiClientRequestOptions {
  signal?: AbortSignal;
}

/**
 * 调用远端服务方法（普通一次性请求）。
 * 自动注入当前 token；若响应携带新的 token/session 则写回 auth store。
 * @template T 期望的返回数据类型
 * @param serviceName 服务名（如 "Api"）
 * @param managerName 管理器名（如 "AuthManager"）
 * @param methodName 方法名
 * @param params 方法参数（非数组时自动包装为单元素数组）
 * @param options 可选配置（含 AbortSignal，用于取消请求）
 * @returns 解析后的响应体 Result 字段（envelope.Result）
 */
const invokeMethod = async <T>(
  serviceName: string,
  managerName: string,
  methodName: string,
  params: any,
  options?: ApiClientRequestOptions
): Promise<T> => {
  const apiUrl = import.meta.env.VITE_API_URL;
  const { accessToken, refreshToken, setAuth, signOut } = useAuthStore.getState();

  const request: ServiceInvocationRequestDto = {
    ManagerName: managerName,
    MethodName: methodName,
    Parameters: Array.isArray(params) ? params : [params],
    AccessToken: accessToken,
    RefreshToken: refreshToken,
  };

  const response = await fetch(`${apiUrl}/${serviceName}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options?.signal,
  });

  if (response.status === 401) {
    signOut();
    throw new Error('Unauthorized');
  }

  if (response.status === 403) {
    throw new Error('Forbidden');
  }

  if (!response.ok) {
    throw new Error(`Error with status code: ${response.status}`);
  }

  const envelope = (await response.json()) as ServiceInvocationResponseEnvelopeDto;
  if (envelope.AccessToken || envelope.RefreshToken || envelope.Session) {
    setAuth(envelope.AccessToken ?? accessToken, envelope.RefreshToken ?? refreshToken, envelope.Session ?? null);
  }

  return envelope.Result as T;
};

/**
 * 调用远端服务方法（流式响应，SSE 风格逐行 JSON）。
 * 通过 fetch + ReadableStream 逐行解析；遇到 Type==='auth' 的事件时刷新
 * token/session，其余已解析对象通过 onData 回调吐出。遇 401 触发登出。
 * @param serviceName 服务名
 * @param managerName 管理器名
 * @param methodName 方法名
 * @param params 方法参数（非数组时自动包装为单元素数组）
 * @param onData 每行解析成功后的回调
 * @param options 可选配置（含 AbortSignal）
 */
const streamMethod = async (
  serviceName: string,
  managerName: string,
  methodName: string,
  params: any,
  onData: (chunk: any) => void,
  options?: ApiClientRequestOptions
) => {
  const apiUrl = import.meta.env.VITE_API_URL;
  const { accessToken, refreshToken, setAuth, signOut } = useAuthStore.getState();

  const request: ServiceStreamingRequestDto = {
    ManagerName: managerName,
    MethodName: methodName,
    Parameters: Array.isArray(params) ? params : [params],
    AccessToken: accessToken,
    RefreshToken: refreshToken,
  };

  const response = await fetch(`${apiUrl}/${serviceName}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options?.signal,
  });

  if (response.status === 401) {
    signOut();
    throw new Error('Unauthorized');
  }

  if (response.status === 403) {
    throw new Error('Forbidden');
  }

  if (!response.ok) {
    throw new Error(`Error with status code: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Readable stream not supported by the browser.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parsed = JSON.parse(trimmed);
    if (parsed?.Type === 'auth') {
      setAuth(parsed.AccessToken ?? accessToken, parsed.RefreshToken ?? refreshToken, parsed.Session ?? null);
      return;
    }

    onData(parsed);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop()!;

    for (const line of lines) {
      handleLine(line);
    }
  }

  const leftover = buffer.trim();
  if (leftover) {
    handleLine(leftover);
  }
};

export default { invokeMethod, streamMethod };
