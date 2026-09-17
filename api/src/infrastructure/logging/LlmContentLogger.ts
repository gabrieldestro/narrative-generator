import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { resolveLogPath } from './LoggerPaths.js';

export interface LlmContentRecord {
  timestamp: string;
  sessionId?: string;
  turnNumber: number;
  agent: string;
  fullPrompt: string;
  fullResponse: string;
  inputTokens?: number;
  outputTokens?: number;
  status: 'success' | 'error';
  durationMs: number;
}

type LlmContentRecordInput = Omit<LlmContentRecord, 'sessionId'> & { sessionId?: string };

export class LlmContentLogger {
  private readonly logPath: string;

  constructor(logPath = resolveLogPath('llm_content.jsonl')) {
    this.logPath = logPath;
    mkdirSync(dirname(logPath), { recursive: true });
  }

  record(entry: LlmContentRecordInput): void {
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.logPath, line, 'utf-8');
  }

  async measure<T>(
    agent: string,
    turnNumber: number,
    prompt: string,
    fn: () => Promise<T>,
    sessionId?: string,
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const responseStr = typeof result === 'object' && result !== null
        ? String((result as any)?.content ?? JSON.stringify(result))
        : String(result);

      const usageMetadata = (result as any)?.usage_metadata;

      this.record({
        timestamp: new Date().toISOString(),
        ...(sessionId ? { sessionId } : {}),
        turnNumber,
        agent,
        fullPrompt: prompt,
        fullResponse: responseStr,
        inputTokens: usageMetadata?.input_tokens,
        outputTokens: usageMetadata?.output_tokens,
        status: 'success',
        durationMs: Date.now() - start,
      });

      return result;
    } catch (err) {
      this.record({
        timestamp: new Date().toISOString(),
        ...(sessionId ? { sessionId } : {}),
        turnNumber,
        agent,
        fullPrompt: prompt,
        fullResponse: '',
        status: 'error',
        durationMs: Date.now() - start,
      });
      throw err;
    }
  }
}
