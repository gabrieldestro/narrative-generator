import type { ActionEvent, FactSheet } from "../../domain/types.js";
import type { ILogger } from "../../domain/ports.js";
import type { LlmClient } from "../shared/LlmClient.js";
import type { IStructuredResolver } from "../shared/StructuredResolver.js";
import { validateFactSheet, normalizeFactSheet } from "../shared/selfHealing/JsonValidators.js";
import {
  summarizeSystemPrompt,
  summarizeHumanPrompt,
  updateWorldContextSystemPrompt,
  updateWorldContextHumanPrompt,
} from "../../domain/prompts/game.js";
import {
  FACTS_FORMAT_SPEC,
  CONSOLIDATE_SYSTEM_PROMPT,
  consolidateHumanPrompt,
} from "../../domain/prompts/memory.js";

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

/**
 * Memória (doc 27, Fase 4 — §7.2/§8.1). Dona de `summarizeMemory` (prosa),
 * `consolidateFacts` (factual, replace limitado) e `updateWorldContext`.
 * Fail-safe: JSON inválido após repair ⇒ mantém `oldSheet` (nunca apaga).
 */
export class MemoryService {
  readonly temperature = 0.0;
  private readonly appLogger: ILogger;

  constructor(
    private readonly client: LlmClient,
    private readonly resolver: IStructuredResolver,
    appLogger?: ILogger,
  ) {
    this.appLogger = appLogger ?? new NullLogger();
  }

  async summarizeMemory(
    longTermSummary: string | undefined,
    oldestTurns: string[],
    turn = 0,
  ): Promise<string> {
    return this.client.invoke(
      summarizeSystemPrompt(),
      summarizeHumanPrompt(longTermSummary, oldestTurns),
      { agent: 'Sumarizador', turn, temperature: this.temperature },
    );
  }

  async updateWorldContext(currentContext: string, lastNarration: string, turn = 0): Promise<string> {
    return this.client.invoke(
      updateWorldContextSystemPrompt(),
      updateWorldContextHumanPrompt(currentContext, lastNarration),
      { agent: 'Atualizador:Contexto', turn, temperature: this.temperature },
    );
  }

  async consolidateFacts(
    oldSheet: FactSheet | undefined,
    sceneEvents: ActionEvent[],
    sceneNarrations: string[],
    turn = 0,
  ): Promise<FactSheet> {
    const fallback: FactSheet = oldSheet ?? { facts: [], threads: [] };
    const healed = await this.resolver.resolveJson({
      agent: 'Memória:Fatos',
      turn,
      system: CONSOLIDATE_SYSTEM_PROMPT,
      human: consolidateHumanPrompt(oldSheet, sceneEvents, sceneNarrations),
      schemaSpec: FACTS_FORMAT_SPEC,
      validate: validateFactSheet,
      compact: true,
    });
    if (!healed) {
      this.appLogger.warn('[Memória] consolidateFacts falhou, mantendo ficha antiga', { turn });
      return fallback;
    }
    const normalized = normalizeFactSheet(healed.value);
    return { facts: normalized.facts, threads: normalized.threads };
  }

  getClient(): LlmClient {
    return this.client;
  }
}
