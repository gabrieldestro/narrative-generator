import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { GameSettings } from "../../domain/types.js";
import { DEFAULT_SETTINGS } from "../../domain/types.js";
import type { ILogger } from "../../domain/ports.js";
import type { LlmCallLogger } from "../../infrastructure/LlmCallLogger.js";
import { classifyLlmError } from "./LlmErrorClassifier.js";
import { jsonRepairSystemPrompt, jsonRepairHumanPrompt } from "../prompts.js";

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

export function tryParseJson(raw: string): unknown | undefined {
  const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();

  const parseAttempts: string[] = [stripped];

  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    parseAttempts.push(stripped.slice(firstBrace, lastBrace + 1));
  }

  for (const str of parseAttempts) {
    try {
      return JSON.parse(str);
    } catch {
      continue;
    }
  }

  return undefined;
}

export interface InvokeWithRetryOptions {
  agent: string;
  turn: number;
  build: (budget: number) => BaseMessage[] | Promise<BaseMessage[]>;
  maxBudget: number;
  minBudget?: number;
  budgetStep?: number;
  maxRetries?: number;
  startAttempt?: number;
  initialBudget?: number;
}

export interface ParseWithRepairOptions {
  agent: string;
  turn: number;
  raw: string;
  schemaSpec: string;
  validate: (value: unknown) => boolean;
  repairSystemPrompt?: string;
  maxRetries?: number;
  maxInputChars?: number;
  compact?: boolean;
}

export class SelfHealingService {
  private readonly settings: GameSettings;
  private readonly logger: ILogger;

  constructor(
    private readonly llm: BaseChatModel,
    private readonly llmCallLogger?: LlmCallLogger,
    logger?: ILogger,
    settings: Partial<GameSettings> = {},
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.logger = logger ?? new NullLogger();
  }

  async invokeWithRetry(options: InvokeWithRetryOptions): Promise<string> {
    const maxAttempts = (options.maxRetries ?? this.settings.maxHealRetries) + 1;
    const minBudget = options.minBudget ?? 0;
    const step = options.budgetStep ?? 1;
    const startAttempt = options.startAttempt ?? 1;
    const lastAttempt = startAttempt + maxAttempts - 1;
    let budget = options.maxBudget;
    if (options.initialBudget !== undefined) {
      budget = Math.max(minBudget, Math.min(budget, options.initialBudget));
    }

    for (let attempt = startAttempt; attempt <= lastAttempt; attempt++) {
      const messages = await options.build(budget);
      try {
        return await this.invoke(options.agent, options.turn, messages, attempt);
      } catch (err) {
        if (classifyLlmError(err) !== 'context_overflow') {
          throw err;
        }
        if (attempt >= lastAttempt || budget <= minBudget) {
          throw err;
        }
        this.logger.warn('[SelfHealing] estouro de contexto, reduzindo contexto', {
          agent: options.agent,
          turnNumber: options.turn,
          attempt,
          budget,
        });
        budget = Math.max(minBudget, budget - step);
      }
    }

    throw new Error(`[SelfHealing] invokeWithRetry falhou inesperadamente para ${options.agent}`);
  }

  async parseWithRepair(options: ParseWithRepairOptions): Promise<{ value: unknown; attempt: number } | null> {
    const maxAttempts = (options.maxRetries ?? this.settings.maxHealRetries) + 1;
    let currentRaw = options.raw;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const parsed = tryParseJson(currentRaw);
      if (parsed !== undefined && options.validate(parsed)) {
        return { value: parsed, attempt };
      }

      if (attempt >= maxAttempts) {
        break;
      }

      const invalidForRepair = this.truncate(currentRaw, options.maxInputChars ?? this.settings.jsonRepairMaxInputChars);
      const repairHuman = jsonRepairHumanPrompt(invalidForRepair, options.schemaSpec, options.compact);
      const messages = [
        new SystemMessage(options.repairSystemPrompt ?? jsonRepairSystemPrompt),
        new HumanMessage(repairHuman),
      ];

      const start = Date.now();
      try {
        currentRaw = await this.invoke(options.agent, options.turn, messages, attempt + 1);
      } catch (err) {
        this.logger.error('[SelfHealing] falha ao solicitar reparo de JSON', {
          agent: options.agent,
          turnNumber: options.turn,
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
        break;
      }

      this.logger.warn('[SelfHealing] reparo de JSON acionado', {
        agent: options.agent,
        turnNumber: options.turn,
        attempt,
        durationMs: Date.now() - start,
      });
    }

    this.logger.error('[SelfHealing] JSON inválido após reparo', {
      agent: options.agent,
      turnNumber: options.turn,
    });
    return null;
  }

  private async invoke(agent: string, turn: number, messages: BaseMessage[], attempt: number): Promise<string> {
    if (this.llmCallLogger) {
      const response = await this.llmCallLogger.measure(agent, turn, () => this.llm.invoke(messages), attempt);
      return response.content as string;
    }
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  private truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }
    return `...(truncado) ${text.slice(-maxChars)}`;
  }
}
