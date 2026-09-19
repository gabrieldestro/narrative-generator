import { randomUUID } from 'crypto';
import type { GameState, GameSettings, NpcDecision, DiceRoll, GateChannel, TurnStep } from "../../domain/types.js";
import { DEFAULT_SETTINGS } from "../../domain/types.js";
import type { IUserInput, IOutputWriter, ILogger } from "../../domain/ports.js";
import { TurnStore, TurnError } from "../turn/TurnStore.js";
import type { IStateRepository } from "../../infrastructure/persistence/JsonStateRepository.js";
import type { LlmService } from "../shared/LlmService.js";
import type { SessionFactory } from "./SessionFactory.js";
import type { CharacterService } from "../characters/CharacterService.js";
import type { TurnService } from "../turn/TurnService.js";
import { WorldService } from "../world/WorldService.js";
import { AdminCommandService } from "../admin/AdminCommandService.js";

class DummyInput implements IUserInput {
  async question(_prompt: string): Promise<string> {
    return "";
  }
  close(): void {}
}

class DummyOutput implements IOutputWriter {
  write(_text: string): void {}
  writeLine(_text: string): void {}
  clear(): void {}
}

class NullLogger implements ILogger {
  trace(_msg: string, ..._args: unknown[]): void {}
  debug(_msg: string, ..._args: unknown[]): void {}
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
  fatal(_msg: string, ..._args: unknown[]): void {}
  child(_bindings: Record<string, unknown>): ILogger { return this; }
}

export interface StartTurnResult {
  turnId: string;
  turnNumber: number;
  actor: string;
  actionText: string;
  diceRoll: DiceRoll;
  allowed: { who: string; channel: Exclude<GateChannel, 'none'> }[];
  denied: { who: string; why: string }[];
  reactionsPending: number;
  sceneDescription?: string | undefined;
}

export interface ReactTurnResult {
  turnId: string;
  who: string;
  action?: string | undefined;
  ignored: boolean;
  channel: Exclude<GateChannel, 'none'>;
  reactionsPending: number;
  reactionsDone: boolean;
}

export interface ArbiterTurnResult {
  turnId: string;
  outcome: 'success' | 'partial' | 'failure';
  reason: string;
  violent: boolean;
  resolutionLine: string;
}

export interface NarrateTurnResult {
  turnId: string;
  narration: string;
}

export interface FinishTurnResult {
  narrative: string;
  logicalResolution: string;
  npcDecisions: NpcDecision[];
  diceRolls: DiceRoll[];
  state: GameState;
  stepTrace: TurnStep[];
  nextActor: string | null;
  awaitingPlayer: boolean;
}

export class GameService {
  private settings: GameSettings;
  private readonly worldService: WorldService;
  private readonly input: IUserInput;
  private readonly output: IOutputWriter;
  private readonly logger: ILogger;
  private readonly adminCommandService: AdminCommandService;
  /** Saga de turnos em memória, sem TTL (1 turno aberto/sessão). */
  private readonly turnStore = new TurnStore();
  /** Cursor da rotação automática: último ator por sessão (memória). */
  private readonly lastActorBySession = new Map<string, string>();

  constructor(
    input?: IUserInput,
    output?: IOutputWriter,
    private readonly repository?: IStateRepository,
    private readonly llmService?: LlmService,
    private readonly characterService?: CharacterService,
    private readonly sessionFactory?: SessionFactory,
    settings: Partial<GameSettings> = {},
    worldService?: WorldService,
    logger?: ILogger,
    adminCommandService?: AdminCommandService,
    private readonly orchestrator?: TurnService,
  ) {
    this.input = input ?? new DummyInput();
    this.output = output ?? new DummyOutput();
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.worldService = worldService ?? new WorldService(this.llmService!);
    this.logger = logger ?? new NullLogger();
    this.adminCommandService = adminCommandService ?? new AdminCommandService(this.worldService, this.llmService, this.logger);
  }

  public updateSettings(partial: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...partial };
    // Doc 27, Fase 3: o orquestrador guarda cópia — encaminha para não divergir.
    this.orchestrator?.updateSettings(this.settings);
  }

  public getSettings(): Readonly<GameSettings> {
    return this.settings;
  }

  public async start() {
    this.output.clear();
    this.output.writeLine("=== INICIANDO MOTOR NARRATIVO ===");
    let state: GameState;
    let isNewGame = false;

    if (!this.repository) {
      throw new Error("Repository é necessário para iniciar a CLI.");
    }

    const loadedState = await this.repository.load();
    if (loadedState) {
      const shouldLoad = await this.input.question("Save anterior encontrado! Deseja continuar de onde parou? (s/n): ");
      if (shouldLoad.toLowerCase() === 's') {
        state = loadedState;
        this.output.writeLine(`\nJogo carregado! Gênero: ${state.narrativeStyle} | Estilo de Escrita: ${state.writingStyle} | Turno atual: ${state.turnNumber}`);
        this.output.writeLine(`Contexto Atual: ${state.worldContext}`);
        const lastNarrative = this.getLastNarrative(state.history);
        this.output.writeLine(`\n--- Último Prompt ---\n${lastNarrative}`);
        this.output.writeLine("\n--- Pressione Enter para continuar ---");
        await this.input.question("");
      } else {
        state = await this.sessionFactory!.setupNewGame();
        isNewGame = true;
      }
    } else {
      state = await this.sessionFactory!.setupNewGame();
      isNewGame = true;
    }

    if (isNewGame) {
      this.output.writeLine("\n[Gerando narrativa inicial...]\n");
      const initialNarrative = await this.llmService!.generateInitialNarrative(state);
      state.history.push(`Narrativa Inicial: ${initialNarrative}`);
      await this.repository.save(state);
      this.output.writeLine("==================================================");
      this.output.writeLine(initialNarrative);
      this.output.writeLine("==================================================\n");
    }

    // CLI usa a mesma saga faseada do HTTP, com rotação automática:
    // turno do jogador pede input; turno de NPC avança sozinho.
    const CLI_SESSION = '__cli__';
    while (true) {
      this.output.writeLine(`\n--- TURNO ${state.turnNumber} ---`);

      const upcoming = this.nextActorName(state, CLI_SESSION);
      let playerAction: { charName: string; text: string } | null = null;
      if (upcoming) {
        const upcomingChar = state.characters.find((c) => c.name === upcoming);
        if (upcomingChar?.isPlayer === true) {
          let action = "";
          while (true) {
            action = await this.input.question(`[Você - ${upcoming}]: O que você tenta fazer? `);
            if (action.startsWith("/")) {
              await this.handleCliCommand(state, action);
              continue;
            }
            break;
          }
          playerAction = { charName: upcoming, text: action };
        } else {
          this.output.writeLine(`[Vez de ${upcoming}...]`);
        }
      }

      const started = await this.beginTurn(CLI_SESSION, state, playerAction);
      this.output.writeLine(`[${started.actor} tenta: ${started.actionText} (d20: ${started.diceRoll.roll})]`);

      let pending = started.reactionsPending;
      while (pending > 0) {
        const reaction = await this.reactNext(started.turnId, CLI_SESSION);
        if (!reaction.ignored) {
          this.output.writeLine(`[${reaction.who} reage: ${reaction.action}]`);
        }
        pending = reaction.reactionsPending;
      }

      const judged = await this.arbitrateTurn(started.turnId, CLI_SESSION);
      this.output.writeLine(`[Árbitro] ${judged.resolutionLine}`);
      const told = await this.narrateTurn(started.turnId, CLI_SESSION);
      this.output.writeLine("--------------------------------------------------");
      this.output.writeLine(told.narration);
      this.output.writeLine("--------------------------------------------------");

      const finished = await this.finishTurn(started.turnId, CLI_SESSION);
      state = finished.state;

      if (this.repository) {
        await this.repository.save(state);
      }

      const continuar = await this.input.question("\nContinuar para o próximo turno? (s/n) ");
      if (continuar.toLowerCase() !== 's') {
        this.output.writeLine("\nJogo salvo no arquivo json. Até a próxima aventura!");
        break;
      }
    }

    this.input.close();
  }

  public getTurnStore(): TurnStore {
    return this.turnStore;
  }

  /**
   * Propaga o cursor de rotação para o checkpoint filho: cada `finish`
   * (e `observe`/`narrate`) gera um sessionId novo, mas a campanha é a
   * mesma — sem isso a rotação recomeçaria no jogador a cada turno.
   */
  public carryRotation(fromSessionId: string, toSessionId: string): void {
    if (fromSessionId === toSessionId) return;
    const last = this.lastActorBySession.get(fromSessionId);
    if (last !== undefined) this.lastActorBySession.set(toSessionId, last);
  }

  private requireOrchestrator() {
    if (!this.orchestrator) {
      throw new Error('TurnService não injetado no GameService.');
    }
    return this.orchestrator;
  }

  /**
   * Rotação automática do ator: próximo ativo após o último que agiu
   * (ordem players → NPCs). Sem cursor ou sem o nome no roster ⇒ primeiro.
   * Cursor vive em memória (restart recomeça no jogador — sem migração).
   */
  public nextActorName(state: GameState, sessionId: string): string | null {
    const orchestrator = this.requireOrchestrator();
    const ordered = orchestrator.spotlightOrder(
      state.characters.filter((c) => !c.status || c.status === 'active'),
    );
    if (ordered.length === 0) return null;
    const last = this.lastActorBySession.get(sessionId);
    if (!last) return ordered[0]!.name;
    const idx = ordered.findIndex((c) => c.name.toLowerCase() === last.toLowerCase());
    return ordered[(idx + 1) % ordered.length]!.name;
  }

  /**
   * Fase `start`: escolhe o ator (ação do jogador ou próximo da rotação),
   * resolve a ação (NPC = 1 LLM), rola o dado e roda o gate (1 LLM).
   * Sem `playerAction` e com jogador na vez ⇒ 409 `AWAITING_PLAYER`.
   */
  public async beginTurn(
    sessionId: string,
    state: GameState,
    playerAction: { charName: string; text: string } | null,
  ): Promise<StartTurnResult> {
    const orchestrator = this.requireOrchestrator();
    const turnLog = this.logger.child({ turnNumber: state.turnNumber });
    turnLog.info('[beginTurn iniciado]');

    const workingState: GameState = structuredClone(state);
    const roster = orchestrator.activeRoster(workingState);

    let actor = playerAction
      ? (roster.find((c) => c.name.toLowerCase() === playerAction.charName.toLowerCase())
        ?? roster.find((c) => c.isPlayer === true))
      : undefined;
    if (!playerAction) {
      const nextName = this.nextActorName(workingState, sessionId);
      if (!nextName) {
        throw new TurnError('NO_ACTORS', 'Nenhum personagem ativo para agir.', undefined);
      }
      actor = roster.find((c) => c.name === nextName);
      if (actor?.isPlayer === true) {
        throw new TurnError('AWAITING_PLAYER', `Aguardando ação de '${actor.name}'.`, undefined, { nextActor: actor.name });
      }
    }
    if (!actor) {
      throw new TurnError('NO_ACTORS', 'Nenhum personagem ativo para agir.', undefined);
    }

    // Chance de evento inesperado (1x por turno).
    const unexpectedEvent = Math.random() < this.settings.unexpectedEventChance;
    if (unexpectedEvent && this.settings.debug) {
      this.output.writeLine("\x1b[95m[Destino ✨] Algo inesperado está prestes a acontecer...\x1b[0m");
    }

    // Cenário novo quando o ator está num local ainda não descrito.
    let sceneDescription: string | undefined;
    const actorLocation = actor.currentLocation;
    if (actorLocation && actorLocation !== workingState.lastSceneLocation) {
      this.output.writeLine("\n[Cenário] Novo local detectado, descrevendo o ambiente...");
      sceneDescription = await this.llmService!.generateSceneDescription(workingState, actorLocation);
      workingState.lastSceneLocation = actorLocation;
    }

    const actions = new Map<string, string>();
    if (playerAction) actions.set(actor.name, playerAction.text);
    const started = await orchestrator.startAction(workingState, actor, actions, this.output);

    const turnId = randomUUID();
    this.turnStore.begin({
      turnId,
      sessionId,
      turnNumber: workingState.turnNumber,
      status: 'open',
      phase: started.ordered.length > 0 ? 'awaiting_reactions' : 'awaiting_arbiter',
      actorName: actor.name,
      actorWhere: started.actorWhere,
      ...(playerAction ? { playerText: playerAction.text } : {}),
      actionText: started.text,
      actionReasoning: started.reasoning,
      diceRoll: started.diceRoll,
      action: started.action,
      allowed: started.ordered,
      denied: started.denied,
      reactionCursor: 0,
      reacted: [],
      ignored: [],
      priorLines: [`${actor.name}: ${started.text}`],
      resolution: undefined,
      resolutionLine: undefined,
      narration: undefined,
      unexpectedEvent,
      sceneDescription,
      workingState,
      createdAt: Date.now(),
    });
    turnLog.info('[beginTurn concluído]', { turnId, actor: actor.name, reactions: started.ordered.length });
    return {
      turnId,
      turnNumber: workingState.turnNumber,
      actor: actor.name,
      actionText: started.text,
      diceRoll: started.diceRoll,
      allowed: started.ordered.map((r) => ({ who: r.who, channel: r.channel })),
      denied: started.denied.map((r) => ({ who: r.who, why: r.why })),
      reactionsPending: started.ordered.length,
      ...(sceneDescription !== undefined ? { sceneDescription } : {}),
    };
  }

  /** Fase `react`: resolve o próximo reator da fila (1 LLM por chamada). */
  public async reactNext(turnId: string, sessionId: string): Promise<ReactTurnResult> {
    const active = this.turnStore.requireOpen(turnId, sessionId);
    if (active.phase !== 'awaiting_reactions') {
      throw new TurnError('OUT_OF_ORDER', `Turno '${turnId}' não aguarda reações (fase: ${active.phase}).`, turnId);
    }
    const ruling = active.allowed[active.reactionCursor];
    if (!ruling) {
      throw new TurnError('NO_PENDING_REACTIONS', `Turno '${turnId}' sem reações pendentes.`, turnId);
    }
    const orchestrator = this.requireOrchestrator();
    const reactor = active.workingState.characters.find((c) => c.name === ruling.who);
    let ignored = false;
    let action = '';
    let reasoning = '';
    if (reactor && (!reactor.status || reactor.status === 'active')) {
      const result = await orchestrator.resolveReaction(
        active.workingState, reactor, active.priorLines, active.action, ruling.channel, this.output,
      );
      ignored = result.ignored;
      action = result.action;
      reasoning = result.reasoning;
    } else {
      ignored = true;
    }
    if (ignored) {
      active.ignored.push(ruling.who);
    } else {
      active.reacted.push({ who: ruling.who, action, reasoning, channel: ruling.channel });
      active.priorLines.push(`${ruling.who}: ${action}`);
    }
    active.reactionCursor++;
    const reactionsPending = active.allowed.length - active.reactionCursor;
    const reactionsDone = reactionsPending <= 0;
    if (reactionsDone) active.phase = 'awaiting_arbiter';
    return {
      turnId,
      who: ruling.who,
      ...(ignored ? {} : { action }),
      ignored,
      channel: ruling.channel,
      reactionsPending,
      reactionsDone,
    };
  }

  /** Fase `arbiter`: julga a ação + reações e aplica a regra do dado. */
  public async arbitrateTurn(turnId: string, sessionId: string): Promise<ArbiterTurnResult> {
    const active = this.turnStore.requireOpen(turnId, sessionId);
    if (active.phase !== 'awaiting_arbiter') {
      throw new TurnError('OUT_OF_ORDER', `Turno '${turnId}' não aguarda árbitro (fase: ${active.phase}).`, turnId);
    }
    const orchestrator = this.requireOrchestrator();
    const resolution = await orchestrator.arbitrateAction(
      active.workingState,
      active.action,
      active.reacted.map((r) => ({ actor: r.who, text: r.action })),
      active.diceRoll.roll,
    );
    const resolutionLine = orchestrator.renderResolutionLine(active.actorName, active.actionText, resolution);
    active.resolution = resolution;
    active.resolutionLine = resolutionLine;
    active.phase = 'awaiting_narrate';
    return { turnId, outcome: resolution.outcome, reason: resolution.reason, violent: resolution.violent, resolutionLine };
  }

  /** Fase `narrate`: 1-2 parágrafos sobre o fato julgado. */
  public async narrateTurn(turnId: string, sessionId: string): Promise<NarrateTurnResult> {
    const active = this.turnStore.requireOpen(turnId, sessionId);
    if (active.phase !== 'awaiting_narrate' || !active.resolution) {
      throw new TurnError('OUT_OF_ORDER', `Turno '${turnId}' não aguarda narração (fase: ${active.phase}).`, turnId);
    }
    const orchestrator = this.requireOrchestrator();
    const actionLine = `${active.actorName} tenta: ${active.actionText} (d20: ${active.diceRoll.roll})`;
    const narration = await orchestrator.narrateAction(
      active.workingState, actionLine, active.resolution, active.unexpectedEvent,
    );
    active.narration = narration;
    active.phase = 'awaiting_finish';
    this.output.writeLine(narration);
    return { turnId, narration };
  }

  /**
   * Fase `finish` (commit): mutações + cena + memória + `history/summary/
   * worldContext` + `turnNumber++`. Só aqui o estado é definitivo.
   */
  public async finishTurn(turnId: string, sessionId: string): Promise<FinishTurnResult> {
    const active = this.turnStore.requireOpen(turnId, sessionId);
    if (active.phase !== 'awaiting_finish' || !active.resolution || active.narration === undefined) {
      throw new TurnError('OUT_OF_ORDER', `Turno '${turnId}' não está pronto para commit (fase: ${active.phase}).`, turnId);
    }
    const orchestrator = this.requireOrchestrator();
    const turnLog = this.logger.child({ turnNumber: active.workingState.turnNumber });
    const committed = await orchestrator.commitTurn(active.workingState, {
      actorName: active.actorName,
      actionText: active.actionText,
      reactions: active.reacted.map((r) => ({ who: r.who, action: r.action })),
      resolution: active.resolution,
      actorWhere: active.actorWhere,
      narration: active.narration,
      ...(active.sceneDescription !== undefined ? { sceneDescription: active.sceneDescription } : {}),
      gate: {
        allowed: active.allowed.map((r) => ({ who: r.who, channel: r.channel })),
        denied: active.denied.map((r) => ({ who: r.who, why: r.why })),
      },
      reacted: active.reacted.map((r) => r.who),
      ignored: active.ignored,
    });

    const narrative = active.sceneDescription
      ? `${active.sceneDescription}\n\n${active.narration}`
      : active.narration;
    const success = active.resolution.outcome !== 'failure';
    const npcDecisions: NpcDecision[] = [];
    const actorChar = active.workingState.characters.find((c) => c.name === active.actorName);
    if (actorChar && !actorChar.isPlayer) {
      npcDecisions.push({
        characterName: active.actorName,
        action: active.actionText,
        reasoning: active.actionReasoning,
        success,
      });
    }
    for (const reaction of active.reacted) {
      const reactor = active.workingState.characters.find((c) => c.name === reaction.who);
      if (reactor && !reactor.isPlayer) {
        npcDecisions.push({ characterName: reaction.who, action: reaction.action, reasoning: reaction.reasoning, success });
      }
    }

    await this.applyTurnPostProcessing(active.workingState, narrative);

    this.lastActorBySession.set(sessionId, active.actorName);
    const nextActor = this.nextActorName(active.workingState, sessionId);
    const nextChar = nextActor
      ? active.workingState.characters.find((c) => c.name === nextActor)
      : undefined;
    this.turnStore.finish(turnId);
    turnLog.info('[finishTurn concluído]', { turnId, actor: active.actorName });
    return {
      narrative,
      logicalResolution: committed.resolutionLine,
      npcDecisions,
      diceRolls: [active.diceRoll],
      state: active.workingState,
      stepTrace: [committed.trace],
      nextActor,
      awaitingPlayer: nextChar?.isPlayer === true,
    };
  }

  /** Progresso + acumulados parciais (resume após F5). */
  public getTurnStatus(turnId: string, sessionId: string): {
    turnId: string; status: string; phase: string; actor: string; actionText: string;
    diceRoll: DiceRoll; reactionsPending: number;
    reacted: { who: string; action: string }[]; ignored: string[];
    resolutionLine?: string | undefined; narration?: string | undefined;
  } {
    const turn = this.turnStore.get(turnId);
    if (!turn) throw new TurnError('TURN_NOT_FOUND', `Turno '${turnId}' não encontrado.`, turnId);
    if (turn.sessionId !== sessionId) {
      throw new TurnError('SESSION_MISMATCH', `Turno '${turnId}' não pertence à sessão.`, turnId);
    }
    return {
      turnId,
      status: turn.status,
      phase: turn.phase,
      actor: turn.actorName,
      actionText: turn.actionText,
      diceRoll: turn.diceRoll,
      reactionsPending: turn.allowed.length - turn.reactionCursor,
      reacted: turn.reacted.map((r) => ({ who: r.who, action: r.action })),
      ignored: [...turn.ignored],
      ...(turn.resolutionLine !== undefined ? { resolutionLine: turn.resolutionLine } : {}),
      ...(turn.narration !== undefined ? { narration: turn.narration } : {}),
    };
  }

  public cancelTurn(turnId: string, sessionId: string): void {
    const turn = this.turnStore.get(turnId);
    if (!turn) throw new TurnError('TURN_NOT_FOUND', `Turno '${turnId}' não encontrado.`, turnId);
    if (turn.sessionId !== sessionId) {
      throw new TurnError('SESSION_MISMATCH', `Turno '${turnId}' não pertence à sessão.`, turnId);
    }
    this.turnStore.cancel(turnId);
    this.logger.info('[cancelTurn]', { turnId });
  }

  private async applyTurnPostProcessing(state: GameState, narrative: string): Promise<void> {
    state.history.push(`Turno ${state.turnNumber}: ${narrative}`);

    if (state.history.length > this.settings.memoryWindowSize) {
      this.output.writeLine("\n[Motor] Sumarizando memórias antigas...");
      const excessCount = state.history.length - this.settings.memoryWindowSize;
      const oldestTurns = state.history.slice(0, excessCount);
      state.longTermSummary = await this.llmService!.summarizeMemory(state.longTermSummary, oldestTurns, state.turnNumber);
      state.history = state.history.slice(excessCount);
    }

    this.output.writeLine("\n[Motor] Atualizando contexto do mundo...");
    state.worldContext = await this.llmService!.updateWorldContext(state.worldContext, narrative, state.turnNumber);

    state.turnNumber++;
  }

  /**
   * Gera uma observação/detalhamento da cena e a registra no histórico,
   * contando para o limite de sumarização, mas sem avançar o turno.
   */
  public async recordObservation(state: GameState, request: string, characterName?: string): Promise<string> {
    const observation = await this.llmService!.generateObservation(state, request, characterName);
    state.history.push(`Observação (Turno ${state.turnNumber}): ${observation}`);

    if (state.history.length > this.settings.memoryWindowSize) {
      const excessCount = state.history.length - this.settings.memoryWindowSize;
      const oldestTurns = state.history.slice(0, excessCount);
      state.longTermSummary = await this.llmService!.summarizeMemory(state.longTermSummary, oldestTurns, state.turnNumber);
      state.history = state.history.slice(excessCount);
    }

    return observation;
  }

  /**
   * Processa uma NARRAÇÃO DECLARADA do jogador: o LLM narra respeitando
   * fielmente a declaração (bypassa árbitro, NPCs e dados) e, em seguida,
   * o estado do mundo é resolvido como no fim de um turno (itens, locais,
   * ciclo de vida, contexto do mundo e localizações) SEM avançar o turno.
   */
  public async recordPlayerNarration(state: GameState, request: string, characterName?: string): Promise<string> {
    const narration = await this.llmService!.generatePlayerNarration(state, request, characterName);
    state.history.push(`Narração (Turno ${state.turnNumber}): ${narration}`);

    // Executa a extração automática pós-narração pelo LLM
    this.output.writeLine("\n[Motor] Analisando narrativa para atualizar estado de RPG...");
    const stateWithUpdates = await this.worldService.applyAutomaticStateUpdates(state, narration);
    state.characters = stateWithUpdates.characters;
    if (stateWithUpdates.locations !== undefined) {
      state.locations = stateWithUpdates.locations;
    }

    if (state.history.length > this.settings.memoryWindowSize) {
      this.output.writeLine("\n[Motor] Sumarizando memórias antigas...");
      const excessCount = state.history.length - this.settings.memoryWindowSize;
      const oldestTurns = state.history.slice(0, excessCount);
      state.longTermSummary = await this.llmService!.summarizeMemory(state.longTermSummary, oldestTurns, state.turnNumber);
      state.history = state.history.slice(excessCount);
    }

    this.output.writeLine("\n[Motor] Atualizando contexto do mundo...");
    state.worldContext = await this.llmService!.updateWorldContext(state.worldContext, narration, state.turnNumber);

    this.output.writeLine("[Motor] Extraindo localizações dos personagens...");
    const locations = await this.llmService!.extractCharacterLocations(state, narration);
    if (Object.keys(locations).length > 0) {
      for (const char of state.characters) {
        const loc = locations[char.name];
        if (loc) {
          char.currentLocation = loc;
        }
      }
    }
    // Fase 0 (doc 27): `{}` = "ninguém se moveu" — não tocar em currentLocation.

    return narration;
  }

  public async handleCliCommand(state: GameState, commandText: string): Promise<void> {
    const parts = commandText.trim().split(" ");
    const command = parts[0]!.toLowerCase();
    const args = parts.slice(1);

    if (command === "/observe") {
      const observeText = args.join(" ").trim();
      if (!observeText) {
        this.output.writeLine("Uso: /observe <o que você deseja observar ou detalhar da cena>");
        return;
      }
      const playerChar = state.characters.find(c => c.isPlayer && (!c.status || c.status === 'active'));
      const charName = playerChar?.name ?? 'Jogador';

      this.output.writeLine(`\n[Observação] ${charName} examina a cena...`);
      const observation = await this.recordObservation(state, observeText, charName);
      this.output.writeLine("--------------------------------------------------");
      this.output.writeLine(observation);
      this.output.writeLine("--------------------------------------------------");
      return;
    }

    if (command === "/narrate") {
      const narrateText = args.join(" ").trim();
      if (!narrateText) {
        this.output.writeLine("Uso: /narrate <o que você declara que acontece na cena>");
        return;
      }
      const playerChar = state.characters.find(c => c.isPlayer && (!c.status || c.status === 'active'));
      const charName = playerChar?.name ?? 'Jogador';

      this.output.writeLine(`\n[Narração Declarada] ${charName} declara a cena...`);
      const narration = await this.recordPlayerNarration(state, narrateText, charName);
      this.output.writeLine("--------------------------------------------------");
      this.output.writeLine(narration);
      this.output.writeLine("--------------------------------------------------");
      return;
    }

    if (command === "/extract-char") {
      this.output.writeLine("\n[LLM] Extração interativa de ficha de personagem a partir do histórico.");
      const result = await this.adminCommandService.execute(state, {
        command,
        collectFields: async (_field, prompt) => this.input.question(prompt)
      });

      const payload = result.payload as { sheet?: any } | undefined;
      if (payload?.sheet) {
        const sheet = payload.sheet;
        this.output.writeLine(`\n--- Ficha gerada pelo LLM ---`);
        this.output.writeLine(`  Nome: ${sheet.name}`);
        this.output.writeLine(`  Descrição: ${sheet.description}`);
        this.output.writeLine(`  Personalidade: ${sheet.personality}`);
        this.output.writeLine(`  Local: ${sheet.currentLocation}`);

        const confirm = await this.input.question("\nAdicionar este personagem ao estado? (s/n): ");
        if (confirm.toLowerCase() === "s") {
          const addResult = await this.adminCommandService.execute(state, {
            command: "/add-char",
            fields: {
              name: sheet.name,
              description: sheet.description,
              personality: sheet.personality,
              location: sheet.currentLocation
            }
          });
          state.characters = addResult.state.characters;
          this.output.writeLine(addResult.message);
        } else {
          this.output.writeLine("Operação cancelada.");
        }
      } else {
        this.output.writeLine(result.message);
      }
      return;
    }

    const result = await this.adminCommandService.execute(state, {
      command,
      args,
      collectFields: async (_field, prompt) => this.input.question(prompt)
    });

    state.characters = result.state.characters;
    if (result.state.locations) {
      state.locations = result.state.locations;
    }
    if (result.state.concepts) {
      state.concepts = result.state.concepts;
    }

    this.output.writeLine(result.message);
  }

  private getLastNarrative(history: string[]): string {
    for (let i = history.length - 1; i >= 0; i--) {
      const entry = history[i]!;
      if (entry.includes("Narrativa Inicial:")) {
        return entry.substring(entry.indexOf("Narrativa Inicial:") + "Narrativa Inicial:".length).trim();
      }
      if (entry.includes("Narrativa:")) {
        return entry.substring(entry.indexOf("Narrativa:") + "Narrativa:".length).trim();
      }
      const turnMatch = entry.match(/^Turno \d+:\s*([\s\S]*)$/);
      if (turnMatch) {
        return turnMatch[1]!.trim();
      }
    }
    return "(Nenhuma narrativa encontrada no histórico)";
  }
}
