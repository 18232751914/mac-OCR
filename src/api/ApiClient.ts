import useAuthStore from '@/auth/AuthStore';
import {
  ServiceInvocationRequestDto,
  ServiceInvocationResponseEnvelopeDto,
  ServiceStreamingRequestDto,
} from './AppDtos';

export interface ApiClientRequestOptions {
  signal?: AbortSignal;
}

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
