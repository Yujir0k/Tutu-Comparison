const MCP_URL = process.env.TUTU_MCP_URL || 'https://mcp.tutu.ru/mcp';
const REQUEST_TIMEOUT_MS = boundedInteger(process.env.TUTU_MCP_TIMEOUT_MS, 20_000, 5_000, 60_000);
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

interface McpResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string; data?: unknown };
}

let requestCounter = 10;

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Call a Tutu MCP tool with bounded retries, payload size and total latency. */
export async function callTutuTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: requestCounter++,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    let response: Response | undefined;
    let lastNetworkError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(MCP_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
          body,
          signal: controller.signal,
        });
        if (response.status < 500 && response.status !== 429) break;
        await response.arrayBuffer().catch(() => undefined);
      } catch (error) {
        lastNetworkError = error;
        if (error instanceof Error && error.name === 'AbortError') throw error;
      }

      if (attempt < 1) await wait(300);
    }

    if (!response) throw lastNetworkError || new Error('Tutu MCP временно недоступен');

    if (!response.ok) {
      throw new Error(`Tutu MCP ответил HTTP ${response.status}`);
    }

    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > MAX_RESPONSE_BYTES) throw new Error('Tutu MCP вернул слишком большой ответ');
    const rawEnvelope = await response.text();
    if (Buffer.byteLength(rawEnvelope, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new Error('Tutu MCP вернул слишком большой ответ');
    }
    const envelope = JSON.parse(rawEnvelope) as McpResponse;
    if (envelope.error) throw new Error(envelope.error.message);

    const text = envelope.result?.content?.find((item) => item.type === 'text' && item.text)?.text;
    if (!text) throw new Error('Tutu MCP вернул ответ без данных');

    if (envelope.result?.isError) {
      let message = text;
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: string };
        message = parsed.message || parsed.error || text;
      } catch {
        // MCP may return a plain-text validation message.
      }
      throw new Error(message);
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Tutu MCP не успел ответить за ${Math.round(REQUEST_TIMEOUT_MS / 1000)} секунд`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Establish DNS/TLS during startup without invoking a search or blocking readiness. */
export async function warmTutuConnection(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(MCP_URL, { method: 'HEAD', signal: controller.signal });
    await response.arrayBuffer();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(raw || fallback);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}
