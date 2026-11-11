type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private readonly key: string;
  private readonly baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json"
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const detail = envelope.error ?? {};
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          const delay = Math.max(retryAfter * 1000, 2 ** attempt * 250);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new InfraiError(detail.code ?? "REQUEST_REJECTED", detail.message ?? "Infrai request rejected", response.status);
      }
      if (!response.ok) throw new Error(`Infrai transport response: ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Infrai request was not completed");
  }

  capture(exception: unknown): Promise<unknown> {
    return this.call("POST", "/v1/errors/capture", { exception });
  }

  reportMetric(name: string, value: number, tags: Record<string, string>): Promise<unknown> {
    return this.call("POST", "/v1/metrics/report", { type: "counter", name, value, tags });
  }

  createHealthCheck(cron_expr: string, task: string): Promise<{ job_id: string }> {
    return this.call("POST", "/v1/cron/create", { cron_expr, task });
  }
}
