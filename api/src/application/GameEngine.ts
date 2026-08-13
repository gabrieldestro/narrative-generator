import type { GameState, Character, GameSettings, Location, NpcDecision, DiceRoll } from "../domain/types.js";
import { DEFAULT_SETTINGS } from "../domain/types.js";
import type { IUserInput, IOutputWriter, ILogger } from "../domain/ports.js";
import type { IStateRepository } from "../infrastructure/JsonStateRepository.js";
import type { LlmService } from "./LlmService.js";
import type { SessionFactory } from "./SessionFactory.js";
import type { CpuReflectionService } from "./npcAgent/CpuReflectionService.js";
import { GameManagementService } from "./GameManagementService.js";

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

export class GameEngine {
  private settings: GameSettings;
  private readonly gameManagementService: GameManagementService;
  private readonly input: IUserInput;
  private readonly output: IOutputWriter;
  private readonly logger: ILogger;

  constructor(
    input?: IUserInput,
    output?: IOutputWriter,
    private readonly repository?: IStateRepository,
    private readonly llmService?: LlmService,
    private readonly cpuReflectionService?: CpuReflectionService,
    private readonly sessionFactory?: SessionFactory,
    settings: Partial<GameSettings> = {},
    gameManagementService?: GameManagementService,
    logger?: ILogger
  ) {
    this.input = input ?? new DummyInput();
    this.output = output ?? new DummyOutput();
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.gameManagementService = gameManagementService ?? new GameManagementService(this.llmService!);
    this.logger = logger ?? new NullLogger();
  }

  public updateSettings(partial: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...partial };
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

    while (true) {
      this.output.writeLine(`\n--- TURNO ${state.turnNumber} ---`);

      // ── Passo 1: coleta a ação do(s) personagem(ns) do jogador em CLI ──
      const playerChars = state.characters.filter(c => c.isPlayer && (!c.status || c.status === 'active'));
      const playerActions: Map<string, string> = new Map();
      for (const char of playerChars) {
        let action = "";
        while (true) {
          action = await this.input.question(`[Você - ${char.name}]: O que você tenta fazer? `);
          if (action.startsWith("/")) {
            await this.handleCliCommand(state, action);
            continue;
          }
          break;
        }
        playerActions.set(char.name, action);
      }

      const turnResult = await this.processTurn(state, playerActions);
      state = turnResult.state;

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

  public async processTurn(
    state: GameState,
    playerActions: Map<string, string>,
    onToken?: (token: string) => void
  ): Promise<{ narrative: string; logicalResolution: string; npcDecisions: NpcDecision[]; diceRolls: DiceRoll[]; state: GameState }> {
    const turnLog = this.logger.child({ turnNumber: state.turnNumber });
    const totalStart = Date.now();
    turnLog.info('[processTurn iniciado]');

    const actions: string[] = [];

    // ── Passo 1: reflete os NPCs em sequência, em ordem aleatória ──
    const npcChars = state.characters.filter(c => !c.isPlayer && (!c.status || c.status === 'active'));
    turnLog.debug('[NPC Reflection] refletindo N NPCs', { n: npcChars.length });
    if (npcChars.length > 0) {
      this.output.writeLine(`[CPU] Refletindo ${npcChars.length} NPC(s) em sequência...`);
    }

    const orderedNpcs = this.shuffle(npcChars);
    const npcResults: { char: Character; action: string; reasoning: string; ok: boolean }[] = [];
    const priorNpcActions: string[] = [];

    for (const char of orderedNpcs) {
      try {
        const decision = await this.cpuReflectionService!
          .reflectAndAct(state, char, this.output, priorNpcActions)
          .then(decision => {
            turnLog.debug('[NPC] decision', { charName: char.name, reasoning: decision.reasoning, action: decision.action });
            return decision;
          });
        npcResults.push({ char, action: decision.action, reasoning: decision.reasoning, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        turnLog.error('[NPC] falha na reflexão', { charName: char.name, error: msg });
        this.output.writeLine(`\r\x1b[91m[CPU - ${char.name}] erro na reflexão: ${msg}\x1b[0m`);
        npcResults.push({ char, action: `${char.name} observa os arredores e reconsidera suas opções.`, reasoning: '', ok: false });
      }
      priorNpcActions.push(`${char.name}: ${npcResults[npcResults.length - 1]!.action}`);
    }

    // Coleta decisões estruturadas dos NPCs
    const npcDecisions: NpcDecision[] = [];
    for (const { char, action, reasoning } of npcResults) {
      npcDecisions.push({ characterName: char.name, action, reasoning, success: false });
    }

    // ── Passo 2: consolida ações (player + NPC) e rola dados ──
    const diceRolls: DiceRoll[] = [];
    for (const char of state.characters) {
      if (char.status && char.status !== 'active') continue;

      let action: string;
      if (char.isPlayer) {
        action = playerActions.get(char.name) ?? `${char.name} hesita por um momento.`;
      } else {
        const npcResult = npcResults.find(
          r => r.char.name === char.name,
        );
        if (npcResult) {
          action = npcResult.action;
          if (!npcResult.ok) {
            this.output.writeLine(`[CPU - ${char.name}] (fallback) ${action}`);
          } else {
            this.output.write(`\r[CPU - ${char.name}] tenta: ${action} \n`);
          }
        } else {
          action = `${char.name} observa os arredores e reconsidera suas opções.`;
          this.output.writeLine(`[CPU - ${char.name}] (fallback) ${action}`);
        }
      }

      // Rola d20 — o god mode garante 20 apenas para o personagem do jogador;
      // os NPCs continuam rolando normalmente.
      const isGodModeRoll = this.settings.godMode && char.isPlayer;
      const roll = isGodModeRoll ? 20 : Math.floor(Math.random() * 20) + 1;
      const prefix = isGodModeRoll ? "\x1b[91m[GOD MODE 🎲]" : "\x1b[93m[Dado 🎲]";
      this.output.writeLine(`${prefix} ${char.name} rolou: ${roll}\x1b[0m`);
      actions.push(`${char.name} tenta: ${action} (Resultado do dado d20: ${roll})`);
      diceRolls.push({ characterName: char.name, roll, isGodMode: isGodModeRoll });
    }

    // Chance de evento inesperado
    const unexpectedEvent = Math.random() < this.settings.unexpectedEventChance;
    if (unexpectedEvent && this.settings.debug) {
      this.output.writeLine("\x1b[95m[Destino ✨] Algo inesperado está prestes a acontecer...\x1b[0m");
    }

    this.output.writeLine("\n[Árbitro] Calculando as consequências...");
    const arbiterStart = Date.now();
    const recentHistory = this.settings.arbiterHistoryTurns > 0
      ? state.history.slice(-this.settings.arbiterHistoryTurns)
      : undefined;
    const logicalResolution = await this.llmService!.arbitrateLogic(state, actions, recentHistory, state.longTermSummary);
    turnLog.info('[Árbitro] resolução obtida', { durationMs: Date.now() - arbiterStart });
    this.output.writeLine(`\x1b[90m(Resolução Mecânica: ${logicalResolution.replace(/\n/g, ' - ')})\x1b[0m`);

    // Determina sucesso/falha de cada NPC a partir da resolução do árbitro
    for (const decision of npcDecisions) {
      const escaped = this.escapeRegex(decision.characterName);
      const failMatch = logicalResolution.match(new RegExp(`${escaped}.*?->\\s*Falha`, 'i'));
      const successMatch = logicalResolution.match(new RegExp(`${escaped}.*?->\\s*Sucesso`, 'i'));
      if (failMatch) {
        decision.success = false;
      } else if (successMatch) {
        decision.success = true;
      }
    }

    // Atualiza scratchpad dos NPCs com base na resolução do árbitro
    for (const char of state.characters) {
      if (!char.isPlayer && char.status === 'active') {
        this.cpuReflectionService!.recordArbiterResult(char, state.turnNumber, logicalResolution);
      }
    }

    // ── Passo 4: descreve o cenário quando o jogador entra/retorna a um novo local ──
    let sceneDescription: string | undefined;
    const scenePlayer = state.characters.find(c => c.isPlayer && (!c.status || c.status === 'active'));
    const playerLocation = scenePlayer?.currentLocation;
    if (playerLocation && playerLocation !== state.lastSceneLocation) {
      this.output.writeLine("\n[Cenário] Novo local detectado, descrevendo o ambiente...");
      turnLog.debug('[Cenário] novo local', { location: playerLocation });
      sceneDescription = await this.llmService!.generateSceneDescription(state, playerLocation);
      state.lastSceneLocation = playerLocation;
    }

    this.output.writeLine("\n[Narrador] Escrevendo a cena...");
    this.output.writeLine("--------------------------------------------------");
    const narrationStart = Date.now();
    const streamWriter: IOutputWriter = {
      write: (text: string) => {
        this.output.write(text);
        if (onToken) onToken(text);
      },
      writeLine: (text: string) => {
        this.output.writeLine(text);
        if (onToken) onToken(text + "\n");
      },
      clear: () => this.output.clear(),
    };
    const outcome = await this.llmService!.narrateFiction(state, actions, logicalResolution, streamWriter, unexpectedEvent, sceneDescription);
    turnLog.info('[Narração] concluída', { durationMs: Date.now() - narrationStart });
    this.output.writeLine("\n--------------------------------------------------");

    state.history.push(`Turno ${state.turnNumber}: ${outcome}`);

    // Executa a extração automática pós-narração pelo LLM
    this.output.writeLine("\n[Motor] Analisando narrativa para atualizar estado de RPG...");
    const stateWithUpdates = await this.gameManagementService.applyAutomaticStateUpdates(state, outcome);
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
    state.worldContext = await this.llmService!.updateWorldContext(state.worldContext, outcome, state.turnNumber);

    this.output.writeLine("[Motor] Extraindo localizações dos personagens...");
    const locations = await this.llmService!.extractCharacterLocations(state, outcome);
    if (Object.keys(locations).length > 0) {
      for (const char of state.characters) {
        const loc = locations[char.name];
        if (loc) {
          char.currentLocation = loc;
        }
      }
    } else {
      for (const char of state.characters) {
        if (!char.currentLocation) {
          char.currentLocation = state.worldContext.slice(0, 60);
        }
      }
    }

    state.turnNumber++;

    const totalDuration = Date.now() - totalStart;
    turnLog.info('[processTurn concluído]', { durationMs: totalDuration });

    return {
      narrative: outcome,
      logicalResolution,
      npcDecisions,
      diceRolls,
      state
    };
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
    const stateWithUpdates = await this.gameManagementService.applyAutomaticStateUpdates(state, narration);
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

    return narration;
  }

  public async handleCliCommand(state: GameState, commandText: string): Promise<void> {
    const parts = commandText.trim().split(" ");
    const command = parts[0]!.toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case "/help":
        this.output.writeLine("\n--- Comandos Administrativos Disponíveis ---");
        this.output.writeLine("/help - Mostra este menu de ajuda.");
        this.output.writeLine("/observe <detalhe da cena> - Detalha/observa um aspecto da cena sem avançar o turno.");
        this.output.writeLine("/narrate <narração declarada> - Força o narrador a narrar o que você declarou e resolve o estado do mundo, sem avançar o turno.");
        this.output.writeLine("/status ou /chars - Mostra os personagens, locais, inventários e status.");
        this.output.writeLine("/map - Mostra o mapa de localizações conhecidas.");
        this.output.writeLine("/add-item <personagem> <item> - Adiciona um item ao inventário.");
        this.output.writeLine("/remove-item <personagem> <item> - Remove um item do inventário.");
        this.output.writeLine("/add-char - Cria interativamente um novo personagem.");
        this.output.writeLine("/remove-char <personagem> - Marca o personagem como perdido ('lost').");
        this.output.writeLine("/add-location - Adiciona manualmente uma localização ao mapa.");
        this.output.writeLine("/remove-location <id> - Remove uma localização do mapa pelo ID.");
        this.output.writeLine("/extract - Extrai mudanças de estado da última narrativa automaticamente.");
        this.output.writeLine("/extract-char - Gera ficha de um personagem a partir do histórico via LLM.");
        break;

      case "/observe": {
        const observeText = args.join(" ").trim();
        if (!observeText) {
          this.output.writeLine("Uso: /observe <o que você deseja observar ou detalhar da cena>");
          break;
        }
        const playerChar = state.characters.find(c => c.isPlayer && (!c.status || c.status === 'active'));
        const charName = playerChar?.name ?? 'Jogador';

        this.output.writeLine(`\n[Observação] ${charName} examina a cena...`);
        const observation = await this.recordObservation(state, observeText, charName);
        this.output.writeLine("--------------------------------------------------");
        this.output.writeLine(observation);
        this.output.writeLine("--------------------------------------------------");
        break;
      }

      case "/narrate": {
        const narrateText = args.join(" ").trim();
        if (!narrateText) {
          this.output.writeLine("Uso: /narrate <o que você declara que acontece na cena>");
          break;
        }
        const playerChar = state.characters.find(c => c.isPlayer && (!c.status || c.status === 'active'));
        const charName = playerChar?.name ?? 'Jogador';

        this.output.writeLine(`\n[Narração Declarada] ${charName} declara a cena...`);
        const narration = await this.recordPlayerNarration(state, narrateText, charName);
        this.output.writeLine("--------------------------------------------------");
        this.output.writeLine(narration);
        this.output.writeLine("--------------------------------------------------");
        break;
      }

      case "/status":
      case "/chars":
        this.output.writeLine("\n--- Status dos Personagens ---");
        for (const char of state.characters) {
          this.output.writeLine(`- ${char.name} [Status: ${char.status || 'active'}]`);
          this.output.writeLine(`  Local: ${char.currentLocation || 'Desconhecido'}`);
          this.output.writeLine(`  Inventário: [${char.inventory ? char.inventory.join(', ') : ''}]`);
          this.output.writeLine(`  Descrição: ${char.description}`);
        }
        break;

      case "/map":
        this.output.writeLine("\n--- Mapa de Localizações ---");
        if (!state.locations || state.locations.length === 0) {
          this.output.writeLine("(Sem localizações cadastradas)");
        } else {
          for (const loc of state.locations) {
            this.output.writeLine(`- ${loc.name} (ID: ${loc.id})`);
            this.output.writeLine(`  Descrição: ${loc.description}`);
            this.output.writeLine(`  Conexões: [${loc.connectedTo.join(', ')}]`);
          }
        }
        break;

      case "/add-item": {
        if (args.length < 2) {
          this.output.writeLine("Uso: /add-item <personagem> <nome do item>");
          break;
        }
        const charName = args[0]!;
        const item = args.slice(1).join(" ");
        const updated = this.gameManagementService.addItemToCharacter(state, charName, item);
        state.characters = updated.characters;
        this.output.writeLine(`Item "${item}" adicionado ao inventário de ${charName}.`);
        break;
      }

      case "/remove-item": {
        if (args.length < 2) {
          this.output.writeLine("Uso: /remove-item <personagem> <nome do item>");
          break;
        }
        const charName = args[0]!;
        const item = args.slice(1).join(" ");
        const updated = this.gameManagementService.removeItemFromCharacter(state, charName, item);
        state.characters = updated.characters;
        this.output.writeLine(`Item "${item}" removido do inventário de ${charName}.`);
        break;
      }

      case "/add-char": {
        const name = await this.input.question("Nome do novo personagem: ");
        const description = await this.input.question("Descrição: ");
        const personality = await this.input.question("Personalidade: ");
        const location = await this.input.question("Localização inicial: ");
        const updated = this.gameManagementService.addCharacter(state, {
          name,
          description,
          personality,
          currentLocation: location,
          isPlayer: false,
          inventory: [],
          status: 'active'
        });
        state.characters = updated.characters;
        this.output.writeLine(`Personagem "${name}" adicionado com sucesso!`);
        break;
      }

      case "/remove-char": {
        if (args.length < 1) {
          this.output.writeLine("Uso: /remove-char <personagem>");
          break;
        }
        const charName = args.join(" ");
        const updated = this.gameManagementService.setCharacterStatus(state, charName, "lost");
        state.characters = updated.characters;
        this.output.writeLine(`Personagem "${charName}" marcado como perdido (lost).`);
        break;
      }

      case "/extract": {
        this.output.writeLine("[LLM] Executando extração automática baseada nas últimas narrativas...");
        const lastNarrative = this.getLastNarrative(state.history);
        const updated = await this.gameManagementService.applyAutomaticStateUpdates(state, lastNarrative);
        state.characters = updated.characters;
        if (updated.locations) {
          state.locations = updated.locations;
        }
        this.output.writeLine("Extração concluída e estado atualizado!");
        break;
      }

      case "/add-location": {
        const locId = await this.input.question("ID único do local (ex: biblioteca, poco_fundo): ");
        if (!locId.trim()) {
          this.output.writeLine("ID inválido. Operação cancelada.");
          break;
        }
        const locName = await this.input.question("Nome do local: ");
        const locDesc = await this.input.question("Descrição breve: ");
        const locConnRaw = await this.input.question("IDs dos locais conectados (separados por vírgula, ou vazio): ");
        const connectedTo = locConnRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const updatedState = this.gameManagementService.addLocation(state, {
          id: locId.trim(),
          name: locName,
          description: locDesc,
          connectedTo,
        });
        state.locations = updatedState.locations ?? [];
        this.output.writeLine(`Local "${locName}" (ID: ${locId.trim()}) adicionado ao mapa com sucesso!`);
        if (connectedTo.length > 0) {
          this.output.writeLine(`  Conexões bidirecionais criadas com: [${connectedTo.join(", ")}]`);
        }
        break;
      }

      case "/remove-location": {
        if (args.length < 1) {
          this.output.writeLine("Uso: /remove-location <id_do_local>");
          this.output.writeLine("Dica: use /map para ver os IDs disponíveis.");
          break;
        }
        const locationId = args[0]!;
        const existingLoc = (state.locations ?? []).find((l) => l.id === locationId);
        if (!existingLoc) {
          this.output.writeLine(`Local com ID "${locationId}" não encontrado. Use /map para ver os IDs disponíveis.`);
          break;
        }
        const updatedState = this.gameManagementService.removeLocation(state, locationId);
        state.locations = updatedState.locations ?? [];
        this.output.writeLine(`Local "${existingLoc.name}" (ID: ${locationId}) removido do mapa.`);
        this.output.writeLine("  Referências nos demais locais foram limpas automaticamente.");
        break;
      }

      case "/extract-char": {
        this.output.writeLine("\n[LLM] Extração interativa de ficha de personagem a partir do histórico.");
        const charName = await this.input.question("Nome do personagem a extrair: ");
        if (!charName.trim()) {
          this.output.writeLine("Nome inválido. Operação cancelada.");
          break;
        }
        this.output.writeLine(`Histórico disponível: ${state.history.length} entrada(s).`);
        const turnsRaw = await this.input.question(
          `Quantos turnos do histórico analisar? (1-${state.history.length}, padrão = todos): `
        );
        const turnsCount = parseInt(turnsRaw, 10);
        const excerpt = isNaN(turnsCount) || turnsCount <= 0
          ? state.history.join("\n\n")
          : state.history.slice(-turnsCount).join("\n\n");

        this.output.writeLine(`[LLM] Gerando ficha de "${charName}" a partir do histórico...`);
        const sheet = await this.llmService!.extractCharacterFromHistory(
          charName,
          excerpt,
          state.narrativeStyle,
        );

        if (!sheet) {
          this.output.writeLine(`[Erro] Não foi possível gerar a ficha de "${charName}". Tente o comando /add-char para adicioná-lo manualmente.`);
          break;
        }

        this.output.writeLine(`\n--- Ficha gerada pelo LLM ---`);
        this.output.writeLine(`  Nome: ${sheet.name}`);
        this.output.writeLine(`  Descrição: ${sheet.description}`);
        this.output.writeLine(`  Personalidade: ${sheet.personality}`);
        this.output.writeLine(`  Local: ${sheet.currentLocation}`);

        const confirm = await this.input.question("\nAdicionar este personagem ao estado? (s/n): ");
        if (confirm.toLowerCase() === "s") {
          const updatedState = this.gameManagementService.addCharacter(state, {
            name: sheet.name,
            description: sheet.description,
            personality: sheet.personality,
            currentLocation: sheet.currentLocation,
            isPlayer: false,
            inventory: [],
            status: "active",
          });
          state.characters = updatedState.characters;
          this.output.writeLine(`Personagem "${sheet.name}" adicionado com sucesso!`);
        } else {
          this.output.writeLine("Operação cancelada.");
        }
        break;
      }

      default:
        this.output.writeLine(`Comando desconhecido: ${command}. Digite /help para ajuda.`);
    }
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

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }
}
