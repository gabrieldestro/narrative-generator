import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { GameState, Character, GameSettings } from "../domain/types.js";
import { DEFAULT_SETTINGS } from "../domain/types.js";
import type { ILogger } from "../domain/ports.js";
import type { LlmCallLogger } from "../infrastructure/LlmCallLogger.js";
import type { LlmContentLogger } from "../infrastructure/LlmContentLogger.js";
import {
  initialContextSystemPrompt,
  initialContextHumanPrompt,
  playerCharacterSystemPrompt,
  playerCharacterHumanPrompt,
  companionDescriptionSystemPrompt,
  companionDescriptionHumanPrompt,
  initialNarrativeSystemPrompt,
  initialNarrativeHumanPrompt,
  describeSceneSystemPrompt,
  describeSceneHumanPrompt,
  observeSystemPrompt,
  observeHumanPrompt,
  narrateSystemPrompt,
  narrateHumanPrompt,
  extractLocationSystemPrompt,
  extractLocationHumanPrompt,
  extractStateChangesSystemPrompt,
  extractStateChangesHumanPrompt,
  extractCharacterFromHistorySystemPrompt,
  extractCharacterFromHistoryHumanPrompt,
  STATE_CHANGES_FORMAT_SPEC,
  CHARACTER_SHEET_FORMAT_SPEC,
  LOCATION_MAP_FORMAT_SPEC,
} from "./prompts.js";
import { SelfHealingService } from "./selfHealing/SelfHealingService.js";
import { PromptJsonResolver } from "./llm/StructuredResolver.js";
import { LlmClient } from "./llm/LlmClient.js";
import { ArbiterAgent } from "./llm/arbiter/ArbiterAgent.js";
import { MemoryAgent } from "./llm/memory/MemoryAgent.js";
import {
  validateStateChanges,
  validateCharacterSheet,
  validateLocationMap,
  normalizeStateChanges,
} from "./selfHealing/JsonValidators.js";

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
 * Fachada fina sobre os agentes de `api/src/application/llm/`: mantém
 * comandos de sessão e extratores legados (observe/narrate/estado) até a
 * remoção do monolito; o turno roda no `TurnOrchestrator`.
 */
export class LlmService {
  private readonly settings: GameSettings;
  private readonly appLogger: ILogger;
  private readonly selfHealing: SelfHealingService;
  /** Doc 27, Fase 0: prova do padrão — extratores resolvem via `resolveJson`. */
  private readonly structuredResolver: PromptJsonResolver;
  /** Doc 27, Fase 1: árbitro/narrador vivem em classes próprias (§7.2);
   * estes métodos delegam (adaptador legado, zero mudança de fluxo). */
  private readonly llmClient: LlmClient;
  private readonly arbiterAgent: ArbiterAgent;
  /** Doc 27, Fase 4: memória factual junta (`MemoryAgent`). */
  private readonly memoryAgent: MemoryAgent;

  constructor(
    private readonly llm: BaseChatModel,
    settings: Partial<GameSettings> = {},
    private readonly logger?: LlmCallLogger,
    appLogger?: ILogger,
    private readonly contentLogger?: LlmContentLogger,
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.appLogger = appLogger ?? new NullLogger();
    this.selfHealing = new SelfHealingService(llm, logger, this.appLogger, this.settings);
    this.structuredResolver = new PromptJsonResolver(llm, logger, this.appLogger, this.settings, this.contentLogger);
    this.llmClient = new LlmClient(llm, logger, this.appLogger, this.contentLogger);
    this.arbiterAgent = new ArbiterAgent(this.llmClient, this.structuredResolver, this.selfHealing);
    this.memoryAgent = new MemoryAgent(this.llmClient, this.structuredResolver, this.appLogger);
  }

  async generateInitialContext(style: string, writingStyle: string, baseContext?: string): Promise<string> {
    const start = Date.now();
    const messages = [
      new SystemMessage(initialContextSystemPrompt(writingStyle)),
      new HumanMessage(initialContextHumanPrompt(style, writingStyle, baseContext)),
    ];
    const response = await this.llm.invoke(messages);
    this.appLogger.info('[ContextoInicial] gerado', { style, writingStyle, durationMs: Date.now() - start });
    return response.content as string;
  }

  async generatePlayerCharacter(style: string, writingStyle: string, playerName: string): Promise<[string, string]> {
    const start = Date.now();
    const messages = [
      new SystemMessage(playerCharacterSystemPrompt(writingStyle)),
      new HumanMessage(playerCharacterHumanPrompt(style, writingStyle, playerName)),
    ];
    const response = await this.llm.invoke(messages);
    this.appLogger.info('[PersonagemJogador] gerado', { playerName, durationMs: Date.now() - start });
    return this.parseCharacterResponse(response.content as string);
  }

  async generateCompanionDetails(style: string, writingStyle: string, npcName: string): Promise<[string, string]> {
    const start = Date.now();
    const messages = [
      new SystemMessage(companionDescriptionSystemPrompt(writingStyle)),
      new HumanMessage(companionDescriptionHumanPrompt(style, writingStyle, npcName)),
    ];
    const response = await this.llm.invoke(messages);
    this.appLogger.info('[Acompanhante] detalhes gerados', { npcName, durationMs: Date.now() - start });
    return this.parseCharacterResponse(response.content as string);
  }

  async invokePrompts(systemPrompt: string, humanPrompt: string, agent?: string, turn = 0, attempt = 1): Promise<string> {
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ];

    const doInvoke = () => {
      if (this.logger && agent) {
        return this.logger.measure(agent, turn, () => this.llm.invoke(messages), attempt);
      }
      return this.llm.invoke(messages);
    };

    if (this.contentLogger && agent) {
      const fullPrompt = systemPrompt + '\n' + humanPrompt;
      const response = await this.contentLogger.measure(agent, turn, fullPrompt, doInvoke);
      return response.content as string;
    }

    const response = await doInvoke();
    return response.content as string;
  }

  async extractCharacterLocations(state: GameState, narration: string): Promise<Record<string, string>> {
    const system = extractLocationSystemPrompt();
    const human = extractLocationHumanPrompt(
      state.characters.map(c => ({ id: c.id, name: c.name, currentLocation: c.currentLocation })),
      narration,
    );

    try {
      // Fase 0 (doc 27): mesmo prompt/validador/fallback, via `resolveJson`.
      const healed = await this.structuredResolver.resolveJson({
        agent: 'Extrator:Localização',
        turn: state.turnNumber,
        system,
        human,
        schemaSpec: LOCATION_MAP_FORMAT_SPEC,
        validate: validateLocationMap,
        compact: true,
      });
      const parsed = (healed ? healed.value : {}) as Record<string, string>;
      const result: Record<string, string> = {};
      for (const char of state.characters) {
        const location = parsed[char.name];
        result[char.name] = typeof location === 'string' && location.length > 0 ? location : char.currentLocation ?? 'local desconhecido';
      }
      return result;
    } catch (err) {
      this.appLogger.error('[LLM Extraction Error] Falha ao extrair localizações', err instanceof Error ? err : new Error(String(err)));
      return {};
    }
  }

  async extractStateChanges(state: GameState, narration: string): Promise<any> {
    const system = extractStateChangesSystemPrompt();
    const human = extractStateChangesHumanPrompt(state, narration);

    try {
      // Fase 0 (doc 27): mesmo prompt/validador/fallback, via `resolveJson`.
      const healed = await this.structuredResolver.resolveJson({
        agent: 'Extrator:Estado',
        turn: state.turnNumber,
        system,
        human,
        schemaSpec: STATE_CHANGES_FORMAT_SPEC,
        validate: validateStateChanges,
        compact: true,
      });
      return normalizeStateChanges(healed ? healed.value : {});
    } catch (err) {
      this.appLogger.error('[LLM Extraction Error] Falha ao extrair modificações de estado', err instanceof Error ? err : new Error(String(err)));
      return {
        inventoryChanges: [],
        locationChanges: { discovered: [], newConnections: [] },
        characterLifecycle: [],
      };
    }
  }

  async arbitrateLogic(state: GameState, actions: string[], recentHistory?: string[], longTermSummary?: string): Promise<string> {
    // Delega ao `ArbiterAgent.arbitrateTurn` — mesmos prompts de
    // `prompts.ts`, mesmo `invokeWithRetry`, zero mudança de fluxo.
    return this.arbiterAgent.arbitrateTurn(state, actions, recentHistory, longTermSummary);
  }

  async generateInitialNarrative(state: GameState): Promise<string> {
    const messages = [
      new SystemMessage(initialNarrativeSystemPrompt(state)),
      new HumanMessage(initialNarrativeHumanPrompt(state)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async generateSceneDescription(state: GameState, location: string): Promise<string> {
    const messages = [
      new SystemMessage(describeSceneSystemPrompt(state)),
      new HumanMessage(describeSceneHumanPrompt(state, location)),
    ];

    if (this.logger) {
      const response = await this.logger.measure('Descritor:Cenário', state.turnNumber, () => this.llm.invoke(messages));
      return response.content as string;
    }

    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async generateObservation(state: GameState, request: string, characterName?: string): Promise<string> {
    const sizePrompt = this.settings.narrationSizePrompts[this.settings.narrationSize];
    const messages = [
      new SystemMessage(observeSystemPrompt(state, sizePrompt)),
      new HumanMessage(observeHumanPrompt(state, request, characterName)),
    ];

    const start = Date.now();
    if (this.logger) {
      const response = await this.logger.measure('Observador', state.turnNumber, () => this.llm.invoke(messages));
      this.appLogger.info('[Observação] gerada', { characterName, durationMs: Date.now() - start });
      return response.content as string;
    }

    const response = await this.llm.invoke(messages);
    this.appLogger.info('[Observação] gerada', { characterName, durationMs: Date.now() - start });
    return response.content as string;
  }

  async generatePlayerNarration(state: GameState, request: string, characterName?: string): Promise<string> {
    const sizePrompt = this.settings.narrationSizePrompts[this.settings.narrationSize];
    const messages = [
      new SystemMessage(narrateSystemPrompt(state, sizePrompt)),
      new HumanMessage(narrateHumanPrompt(state, request, characterName)),
    ];

    const start = Date.now();
    if (this.logger) {
      const response = await this.logger.measure('Narrador:Declarado', state.turnNumber, () => this.llm.invoke(messages));
      this.appLogger.info('[Narração Declarada] gerada', { characterName, durationMs: Date.now() - start });
      return response.content as string;
    }

    const response = await this.llm.invoke(messages);
    this.appLogger.info('[Narração Declarada] gerada', { characterName, durationMs: Date.now() - start });
    return response.content as string;
  }

  async summarizeMemory(longTermSummary: string | undefined, oldestTurns: string[], turn = 0): Promise<string> {
    // Fase 4 (doc 27): delega ao `MemoryAgent` (mesmos prompts, zero mudança).
    return this.memoryAgent.summarizeMemory(longTermSummary, oldestTurns, turn);
  }

  async updateWorldContext(currentContext: string, lastNarration: string, turn = 0): Promise<string> {
    // Fase 4 (doc 27): delega ao `MemoryAgent` (mesmos prompts, zero mudança).
    return this.memoryAgent.updateWorldContext(currentContext, lastNarration, turn);
  }

  async extractCharacterFromHistory(
    characterName: string,
    historyExcerpt: string,
    narrativeStyle: string,
  ): Promise<{ name: string; description: string; personality: string; currentLocation: string } | null> {
    const start = Date.now();
    const system = extractCharacterFromHistorySystemPrompt();
    const human = extractCharacterFromHistoryHumanPrompt(characterName, historyExcerpt, narrativeStyle);

    try {
      const raw = await this.invokePrompts(system, human);
      const healed = await this.selfHealing.parseWithRepair({
        agent: 'Extrator:Ficha',
        turn: 0,
        raw,
        schemaSpec: CHARACTER_SHEET_FORMAT_SPEC,
        validate: validateCharacterSheet,
      });

      if (!healed) {
        return null;
      }

      const parsed = healed.value as Record<string, string>;
      this.appLogger.info('[Extrator:Ficha] personagem extraído', { characterName, durationMs: Date.now() - start });

      return {
        name: typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : characterName,
        description: typeof parsed.description === 'string' ? parsed.description : 'Personagem recém-descoberto.',
        personality: typeof parsed.personality === 'string' ? parsed.personality : 'Personalidade desconhecida.',
        currentLocation: typeof parsed.currentLocation === 'string' ? parsed.currentLocation : 'Local desconhecido',
      };
    } catch (err) {
      this.appLogger.error('[LLM] Falha ao extrair ficha do personagem do histórico', err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  private parseCharacterResponse(text: string): [string, string] {
    const descMatch = text.match(/Descrição:\s*(.+)/i);
    const persMatch = text.match(/Personalidade:\s*(.+)/i);
    const description = descMatch ? descMatch[1]!.trim() : text.trim();
    const personality = persMatch ? persMatch[1]!.trim() : "Personalidade adaptável e determinada.";
    return [description, personality];
  }
}
