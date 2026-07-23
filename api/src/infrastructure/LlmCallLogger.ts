import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface LlmCallRecord {
  timestamp: string;       // ISO 8601
  agent: string;           // Ex: 'NPC:Elara', 'Arbitro', 'Narrador', 'Sumarizador'
  turnNumber: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  attempt: number;         // 1 = primeira tentativa, 2+ = retry
  status: 'success' | 'error' | 'retry';
  errorMessage?: string;
}

export class LlmCallLogger {
  private readonly logPath: string;

  constructor(logPath = 'logs/llm_calls.jsonl') {
    this.logPath = logPath;
    mkdirSync(dirname(logPath), { recursive: true });
  }

  record(entry: LlmCallRecord): void {
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.logPath, line, 'utf-8');
  }

  /**
   * Wraps an async LLM call, measuring duration and logging the result.
   *
   * @param agent  - Human-readable name of the caller (ex: 'NPC:Elara', 'Narrador')
   * @param turn   - Current game turn number
   * @param fn     - The async function that performs the LLM call
   * @param attempt - Retry attempt number (default 1)
   */
  async measure<T>(
    agent: string,
    turn: number,
    fn: () => Promise<T>,
    attempt = 1,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();

      // Try to extract token usage if the result has LangChain's usage_metadata shape
      const usageMetadata = (result as any)?.usage_metadata;
      const record: LlmCallRecord = {
        timestamp: new Date().toISOString(),
        agent,
        turnNumber: turn,
        durationMs: Date.now() - start,
        attempt,
        status: 'success',
        inputTokens: usageMetadata?.input_tokens,
        outputTokens: usageMetadata?.output_tokens,
        totalTokens: usageMetadata?.total_tokens,
      };
      this.record(record);

      return result;
    } catch (err) {
      const record: LlmCallRecord = {
        timestamp: new Date().toISOString(),
        agent,
        turnNumber: turn,
        durationMs: Date.now() - start,
        attempt,
        status: attempt > 1 ? 'retry' : 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      };
      this.record(record);

      throw err;
    }
  }
}
