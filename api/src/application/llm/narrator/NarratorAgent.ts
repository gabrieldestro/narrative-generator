import { SystemMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { GameState, GameSettings, MicroResolution } from "../../../domain/types.js";
import type { IOutputWriter, ILogger } from "../../../domain/ports.js";
import type { LlmCallLogger } from "../../../infrastructure/LlmCallLogger.js";
import type { LlmContentLogger } from "../../../infrastructure/LlmContentLogger.js";
import type { LlmClient } from "../LlmClient.js";
import type { SelfHealingService } from "../../selfHealing/SelfHealingService.js";
import { classifyLlmError } from "../../selfHealing/LlmErrorClassifier.js";
import { narratorSystemPrompt, narratorHumanPrompt } from "../../prompts.js";
import { microNarratorSystemPrompt, microNarratorHumanPrompt } from "./prompts.js";

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
 * Narrador (doc 27, Fase 1 — §7.2). Dono de `narrateMicro` (1-2 parágrafos
 * sobre 1 fato) + `narrateLegacy` (adaptador do `narrateFiction` gigante:
 * stream + fallback de overflow idênticos).
 */
export class NarratorAgent {
  /** Temp por função (§3): narrador `0.7-0.8` (mesma ressalva de factory do árbitro). */
  readonly temperature = 0.7;
  private readonly settings: GameSettings;
  private readonly appLogger: ILogger;

  constructor(
    private readonly client: LlmClient,
    private readonly selfHealing: SelfHealingService,
    settings: GameSettings,
    private readonly callLogger?: LlmCallLogger,
    appLogger?: ILogger,
    private readonly contentLogger?: LlmContentLogger,
    /** `LlmService.summarizeMemory` ligado — vira `MemoryAgent` na Fase 4. */
    private readonly summarizeMemory?: (
      longTermSummary: string | undefined,
      oldestTurns: string[],
      turn?: number,
    ) => Promise<string>,
  ) {
    this.settings = settings;
    this.appLogger = appLogger ?? new NullLogger();
  }

  async narrateMicro(
    state: GameState,
    actionLine: string,
    resolution: MicroResolution,
    opts: { onToken?: (token: string) => void; unexpected?: boolean } = {},
  ): Promise<string> {
    const sizePrompt = this.settings.narrationSizePrompts[this.settings.narrationSize];
    const text = await this.client.invoke(
      microNarratorSystemPrompt(state, sizePrompt),
      microNarratorHumanPrompt(actionLine, resolution, opts.unexpected),
      { agent: 'Narrador:Micro', turn: state.turnNumber, temperature: this.temperature },
    );
    // Sem `onToken` granular no MVP (volta com o SSE futuro, §7.1):
    // o callback recebe 1x o texto final (compat com o streaming atual).
    opts.onToken?.(text);
    return text;
  }

  /**
   * Adaptador legado: corpo movido de `LlmService.narrateFiction`
   * (stream + fallback de overflow idênticos). Usado pelo
   * `GameEngine.processTurn` até o orquestrador da Fase 3 assumir.
   */
  async narrateLegacy(
    state: GameState,
    actions: string[],
    logicalResolution: string,
    output?: IOutputWriter,
    unexpectedEventTriggered?: boolean,
    sceneDescription?: string,
  ): Promise<string> {
    const sizePrompt = this.settings.narrationSizePrompts[this.settings.narrationSize];

    const buildMessages = async (budget: number): Promise<BaseMessage[]> => {
      const dropped = state.history.length - budget;
      const summary = await this.healSummaryForDroppedTurns(state, dropped);
      const reducedState: GameState = {
        ...state,
        history: state.history.slice(-budget),
        ...(summary !== undefined ? { longTermSummary: summary } : {}),
      };
      return [
        new SystemMessage(narratorSystemPrompt(reducedState, sizePrompt, unexpectedEventTriggered)),
        new HumanMessage(narratorHumanPrompt(reducedState, actions, logicalResolution)),
      ];
    };

    let fullResponse = '';
    if (sceneDescription) {
      if (output) output.write(sceneDescription + '\n\n');
      fullResponse = sceneDescription + '\n\n';
    }

    const start = Date.now();
    const initialMessages = await buildMessages(state.history.length);
    const fullPrompt = initialMessages.map((m) => String(m.content)).join('\n');

    const streamWriter = output
      ? (text: string) => output.write(text)
      : undefined;

    try {
      const text = await this.client.streamMessages(initialMessages, {
        agent: 'Narrador',
        turn: state.turnNumber,
        // `exactOptionalPropertyTypes`: só inclui `onToken` quando há writer.
        ...(streamWriter ? { onToken: streamWriter } : {}),
        temperature: this.temperature,
      });
      return fullResponse + text;
    } catch (err) {
      if (classifyLlmError(err) !== 'context_overflow') {
        throw err;
      }
      this.callLogger?.record({
        timestamp: new Date().toISOString(),
        agent: 'Narrador',
        turnNumber: state.turnNumber,
        durationMs: Date.now() - start,
        attempt: 1,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      const healed = await this.selfHealing.invokeWithRetry({
        agent: 'Narrador',
        turn: state.turnNumber,
        maxBudget: state.history.length,
        minBudget: 0,
        budgetStep: 1,
        startAttempt: 2,
        initialBudget: Math.max(0, state.history.length - 1),
        build: buildMessages,
      });
      if (output) output.write(healed);
      const recovered = fullResponse + healed;
      this.contentLogger?.record({
        timestamp: new Date().toISOString(),
        turnNumber: state.turnNumber,
        agent: 'Narrador',
        fullPrompt,
        fullResponse: recovered,
        status: 'retry',
        durationMs: Date.now() - start,
      } as any);
      return recovered;
    }
  }

  private async healSummaryForDroppedTurns(state: GameState, dropped: number): Promise<string | undefined> {
    if (dropped <= 0 || !this.settings.healSummaryOnOverflow) {
      return state.longTermSummary;
    }
    try {
      const oldestTurns = state.history.slice(0, dropped);
      return await this.summarizeMemory!(state.longTermSummary, oldestTurns, state.turnNumber);
    } catch (err) {
      this.appLogger.warn('[SelfHealing] falha ao sumarizar turnos cortados', {
        turnNumber: state.turnNumber,
        error: err instanceof Error ? err.message : String(err),
      });
      return state.longTermSummary;
    }
  }
}
