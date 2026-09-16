import type { GameState, GameSettings, MicroResolution } from "../../../domain/types.js";
import type { ILogger } from "../../../domain/ports.js";
import type { LlmCallLogger } from "../../../infrastructure/LlmCallLogger.js";
import type { LlmContentLogger } from "../../../infrastructure/LlmContentLogger.js";
import type { LlmClient } from "../LlmClient.js";
import type { SelfHealingService } from "../../selfHealing/SelfHealingService.js";
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
 * Narrador: dono de `narrateMicro` (1-2 parágrafos sobre 1 fato).
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
    opts: { unexpected?: boolean } = {},
  ): Promise<string> {
    const sizePrompt = this.settings.narrationSizePrompts[this.settings.narrationSize];
    const text = await this.client.invoke(
      microNarratorSystemPrompt(state, sizePrompt),
      microNarratorHumanPrompt(actionLine, resolution, opts.unexpected),
      { agent: 'Narrador:Micro', turn: state.turnNumber, temperature: this.temperature },
    );
    return text;
  }
}
