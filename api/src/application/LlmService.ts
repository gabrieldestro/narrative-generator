import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SystemMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { GameState, Character, GameSettings } from "../domain/types.js";
import { DEFAULT_SETTINGS } from "../domain/types.js";
import type { IOutputWriter, ILogger } from "../domain/ports.js";
import type { LlmCallLogger } from "../infrastructure/LlmCallLogger.js";
import type { LlmContentLogger } from "../infrastructure/LlmContentLogger.js";
import {
  arbiterSystemPrompt,
  arbiterHumanPrompt,
  narratorSystemPrompt,
  narratorHumanPrompt,
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
  summarizeSystemPrompt,
  summarizeHumanPrompt,
  updateWorldContextSystemPrompt,
  updateWorldContextHumanPrompt,
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
import {
  validateStateChanges,
  validateCharacterSheet,
  validateLocationMap,
  normalizeStateChanges,
} from "./selfHealing/JsonValidators.js";
import { classifyLlmError } from "./selfHealing/LlmErrorClassifier.js";

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

export class LlmService {
  private readonly settings: GameSettings;
  private readonly appLogger: ILogger;
  private readonly selfHealing: SelfHealingService;

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
  }

  async generateInitialContext(style: string, writingStyle: string): Promise<string> {
    const start = Date.now();
    const messages = [
      new SystemMessage(initialContextSystemPrompt(writingStyle)),
      new HumanMessage(initialContextHumanPrompt(style, writingStyle)),
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
      const raw = await this.invokePrompts(system, human, 'Extrator:Localização', state.turnNumber);
      const healed = await this.selfHealing.parseWithRepair({
        agent: 'Extrator:Localização',
        turn: state.turnNumber,
        raw,
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
      const raw = await this.invokePrompts(system, human, 'Extrator:Estado', state.turnNumber);
      const healed = await this.selfHealing.parseWithRepair({
        agent: 'Extrator:Estado',
        turn: state.turnNumber,
        raw,
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
    const turnsToUse = recentHistory?.length ?? 0;
    return this.selfHealing.invokeWithRetry({
      agent: 'Árbitro',
      turn: state.turnNumber,
      maxBudget: turnsToUse,
      minBudget: 0,
      budgetStep: 1,
      build: (budget) => {
        const history = budget > 0 && recentHistory ? recentHistory.slice(-budget) : undefined;
        return [
          new SystemMessage(arbiterSystemPrompt),
          new HumanMessage(arbiterHumanPrompt(state, actions, history, longTermSummary)),
        ];
      },
    });
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

  async narrateFiction(
    state: GameState,
    actions: string[],
    logicalResolution: string,
    output?: IOutputWriter,
    unexpectedEventTriggered?: boolean,
    sceneDescription?: string
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

    let fullResponse = "";
    if (sceneDescription) {
      if (output) output.write(sceneDescription + "\n\n");
      fullResponse = sceneDescription + "\n\n";
    }

    const start = Date.now();
    const initialMessages = await buildMessages(state.history.length);
    const fullPrompt = initialMessages.map(m => String(m.content)).join('\n');
    let stream: Awaited<ReturnType<typeof this.llm.stream>>;

    try {
      stream = await this.llm.stream(initialMessages);
    } catch (err) {
      if (classifyLlmError(err) !== 'context_overflow') {
        throw err;
      }
      this.logger?.record({
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

    for await (const chunk of stream) {
      const text = chunk.content as string;
      if (output) output.write(text);
      fullResponse += text;
    }

    this.logger?.record({
      timestamp: new Date().toISOString(),
      agent: 'Narrador',
      turnNumber: state.turnNumber,
      durationMs: Date.now() - start,
      attempt: 1,
      status: 'success',
    });

    this.contentLogger?.record({
      timestamp: new Date().toISOString(),
      turnNumber: state.turnNumber,
      agent: 'Narrador',
      fullPrompt,
      fullResponse,
      status: 'success',
      durationMs: Date.now() - start,
    } as any);

    return fullResponse;
  }

  private async healSummaryForDroppedTurns(state: GameState, dropped: number): Promise<string | undefined> {
    if (dropped <= 0 || !this.settings.healSummaryOnOverflow) {
      return state.longTermSummary;
    }
    try {
      const oldestTurns = state.history.slice(0, dropped);
      return await this.summarizeMemory(state.longTermSummary, oldestTurns, state.turnNumber);
    } catch (err) {
      this.appLogger.warn('[SelfHealing] falha ao sumarizar turnos cortados', {
        turnNumber: state.turnNumber,
        error: err instanceof Error ? err.message : String(err),
      });
      return state.longTermSummary;
    }
  }

  async summarizeMemory(longTermSummary: string | undefined, oldestTurns: string[], turn = 0): Promise<string> {
    const messages = [
      new SystemMessage(summarizeSystemPrompt()),
      new HumanMessage(summarizeHumanPrompt(longTermSummary, oldestTurns)),
    ];

    if (this.logger) {
      const response = await this.logger.measure('Sumarizador', turn, () => this.llm.invoke(messages));
      return response.content as string;
    }

    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async updateWorldContext(currentContext: string, lastNarration: string, turn = 0): Promise<string> {
    const messages = [
      new SystemMessage(updateWorldContextSystemPrompt()),
      new HumanMessage(updateWorldContextHumanPrompt(currentContext, lastNarration)),
    ];

    if (this.logger) {
      const response = await this.logger.measure('Atualizador:Contexto', turn, () => this.llm.invoke(messages));
      return response.content as string;
    }

    const response = await this.llm.invoke(messages);
    return response.content as string;
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
