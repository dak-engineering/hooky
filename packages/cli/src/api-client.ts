export type HookSummary = {
  hookId: string;
  name: string;
  state: "active" | "disabled";
  createdAt?: string;
  updatedAt?: string;
};

export type ClaimedDelivery = {
  deliveryId: string;
  eventId: string;
  attemptNumber: number;
  leaseToken: string;
  leasedUntil: string;
  requestMethod: string;
  requestPath: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[]>;
  bodyBase64: string;
  receivedAt: string;
};

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class HookyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "HookyApiError";
  }
}

export class HookyApiClient {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly fetchImplementation: FetchImplementation;

  constructor({
    apiUrl,
    token,
    fetchImplementation = fetch,
  }: {
    apiUrl: string;
    token: string;
    fetchImplementation?: FetchImplementation;
  }) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.token = token;
    this.fetchImplementation = fetchImplementation;
  }

  private async request<T>(
    path: string,
    { method = "GET", body }: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await this.fetchImplementation(`${this.apiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    } & T;

    if (!response.ok) {
      throw new HookyApiError(
        payload.error ?? `Hooky API returned ${response.status}`,
        response.status,
      );
    }
    return payload;
  }

  async listHooks() {
    const response = await this.request<{ hooks: HookSummary[] }>(
      "/api/v1/hooks",
    );
    return response.hooks;
  }

  async createHook(name: string) {
    return this.request<HookSummary & { ingressUrl: string }>("/api/v1/hooks", {
      method: "POST",
      body: { name },
    });
  }

  async claimDeliveries({
    hookId,
    listenerId,
    limit = 5,
    leaseDurationSeconds = 30,
  }: {
    hookId: string;
    listenerId: string;
    limit?: number;
    leaseDurationSeconds?: number;
  }) {
    const response = await this.request<{ deliveries: ClaimedDelivery[] }>(
      `/api/v1/hooks/${encodeURIComponent(hookId)}/deliveries/claim`,
      {
        method: "POST",
        body: { listenerId, limit, leaseDurationSeconds },
      },
    );
    return response.deliveries;
  }

  async acknowledge({
    deliveryId,
    leaseToken,
  }: {
    deliveryId: string;
    leaseToken: string;
  }) {
    await this.request(`/api/v1/deliveries/${deliveryId}/ack`, {
      method: "POST",
      body: { leaseToken },
    });
  }

  async reject({
    deliveryId,
    leaseToken,
    error,
    retryDelaySeconds,
  }: {
    deliveryId: string;
    leaseToken: string;
    error: string;
    retryDelaySeconds: number;
  }) {
    await this.request(`/api/v1/deliveries/${deliveryId}/nack`, {
      method: "POST",
      body: { leaseToken, error, retryDelaySeconds },
    });
  }

  async heartbeat({
    deliveryId,
    leaseToken,
    leaseDurationSeconds = 30,
  }: {
    deliveryId: string;
    leaseToken: string;
    leaseDurationSeconds?: number;
  }) {
    await this.request(`/api/v1/deliveries/${deliveryId}/heartbeat`, {
      method: "POST",
      body: { leaseToken, leaseDurationSeconds },
    });
  }
}
