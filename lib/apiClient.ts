export interface ApiClientOptions {
  baseUrl?: string;
  initDataRaw?: string;
  defaultHeaders?: HeadersInit;
}

export interface ApiRequestOptions extends RequestInit {
  skipAuthHeader?: boolean;
}

export interface ApiClient {
  readonly baseUrl?: string;
  readonly isConfigured: boolean;
  request<TResponse = unknown>(
    path: string,
    options?: ApiRequestOptions
  ): Promise<TResponse>;
  get<TResponse = unknown>(
    path: string,
    options?: ApiRequestOptions
  ): Promise<TResponse>;
  post<TBody = unknown, TResponse = unknown>(
    path: string,
    body?: TBody,
    options?: ApiRequestOptions
  ): Promise<TResponse>;
}

function mergeHeaders(
  baseHeaders: Headers,
  additional?: HeadersInit
): Headers {
  const headers = new Headers(baseHeaders);
  if (!additional) {
    return headers;
  }

  const entries = new Headers(additional);
  entries.forEach((value, key) => {
    headers.set(key, value);
  });

  return headers;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return undefined;
  }

  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function createApiClient({
  baseUrl,
  initDataRaw,
  defaultHeaders
}: ApiClientOptions = {}): ApiClient {
  const resolvedBaseUrl = normalizeBaseUrl(
    baseUrl ?? process.env.NEXT_PUBLIC_API_BASE_URL
  );

  const baseHeaders = new Headers({
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(defaultHeaders ?? {})
  });

  if (initDataRaw) {
    baseHeaders.set('X-Telegram-Init-Data', initDataRaw);
  }

  const request = async <TResponse>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<TResponse> => {
    if (!resolvedBaseUrl) {
      throw new Error('API base URL is not configured.');
    }

    const { skipAuthHeader, ...init } = options;
    const headers = mergeHeaders(baseHeaders, init.headers);

    if (skipAuthHeader) {
      headers.delete('X-Telegram-Init-Data');
    }

    const response = await fetch(`${resolvedBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include' // ВАЖНО: отправляем cookies для JWT авторизации
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unexpected error');
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}\n${errorBody}`
      );
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return (await response.json()) as TResponse;
    }

    return (await response.text()) as TResponse;
  };

  const get = <TResponse>(
    path: string,
    options?: ApiRequestOptions
  ): Promise<TResponse> =>
    request<TResponse>(path, { ...options, method: 'GET' });

  const post = async <TBody, TResponse>(
    path: string,
    body: TBody,
    options: ApiRequestOptions = {}
  ): Promise<TResponse> => {
    const payload =
      body && typeof body === 'object' ? JSON.stringify(body) : (body as BodyInit);

    return request<TResponse>(path, {
      ...options,
      method: options.method ?? 'POST',
      body: payload
    });
  };

  return {
    baseUrl: resolvedBaseUrl,
    isConfigured: Boolean(resolvedBaseUrl),
    request,
    get,
    post
  };
}
