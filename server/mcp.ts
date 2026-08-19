const MCP_URL = process.env.TUTU_MCP_URL || "https://mcp.tutu.ru/mcp";

interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string; data?: unknown };
}

let requestCounter = 10;

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function callTutuTool<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: requestCounter++,
      method: "tools/call",
      params: { name, arguments: args },
    });
    let response: Response | undefined;
    let lastNetworkError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        response = await fetch(MCP_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body,
          signal: controller.signal,
        });
        if (response.status < 500 && response.status !== 429) break;
        await response.arrayBuffer().catch(() => undefined);
      } catch (error) {
        lastNetworkError = error;
        if (error instanceof Error && error.name === "AbortError") throw error;
      }

      if (attempt < 2) await wait(250 * (attempt + 1));
    }

    if (!response) throw lastNetworkError || new Error("Tutu MCP временно недоступен");

    if (!response.ok) {
      throw new Error(`Tutu MCP ответил HTTP ${response.status}`);
    }

    const envelope = (await response.json()) as McpResponse;
    if (envelope.error) throw new Error(envelope.error.message);

    const text = envelope.result?.content?.find(
      (item) => item.type === "text" && item.text,
    )?.text;
    if (!text) throw new Error("Tutu MCP вернул ответ без данных");

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
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Tutu MCP не успел ответить за 45 секунд");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
