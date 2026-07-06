import type { GameState, Character, GameSettings } from "../domain/types.js";
import { DEFAULT_SETTINGS } from "../domain/types.js";
import type { IUserInput, IOutputWriter } from "../domain/ports.js";
import type { IStateRepository } from "../infrastructure/JsonStateRepository.js";
import type { LlmService } from "./LlmService.js";
import type { SessionFactory } from "./SessionFactory.js";
import type { CpuReflectionService } from "./npcAgent/CpuReflectionService.js";

export class GameEngine {
  private readonly settings: GameSettings;

  constructor(
    private readonly input: IUserInput,
    private readonly output: IOutputWriter,
    private readonly repository: IStateRepository,
    private readonly llmService: LlmService,
    private readonly cpuReflectionService: CpuReflectionService,
    private readonly sessionFactory?: SessionFactory,
    settings: Partial<GameSettings> = {}
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  public async start() {
    this.output.clear();
    this.output.writeLine("=== INICIANDO MOTOR NARRATIVO ===");
    let state: GameState;
    let isNewGame = false;

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
      const initialNarrative = await this.llmService.generateInitialNarrative(state);
      state.history.push(`Narrativa Inicial: ${initialNarrative}`);
      await this.repository.save(state);
      this.output.writeLine("==================================================");
      this.output.writeLine(initialNarrative);
      this.output.writeLine("==================================================\n");
    }

    while (true) {
      this.output.writeLine(`\n--- TURNO ${state.turnNumber} ---`);
      const actions: string[] = [];

      for (const char of state.characters) {
        let action = "";
        if (char.isPlayer) {
          action = await this.input.question(`[Você - ${char.name}]: O que você tenta fazer? `);
        } else {
          this.output.write(`[CPU - ${char.name}] está refletindo...`);
          try {
            const decision = await this.cpuReflectionService.reflectAndAct(state, char, this.output);
            action = decision.action;
            this.output.write(`\r[CPU - ${char.name}] tenta: ${action} \n`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.output.writeLine(`\r\x1b[91m[CPU - ${char.name}] erro na reflexão: ${msg}\x1b[0m`);
            action = `${char.name} observa os arredores e reconsidera suas opções.`;
            this.output.writeLine(`[CPU - ${char.name}] (fallback) ${action}`);
          }
        }

        // Rola d20
        const roll = this.settings.godMode ? 20 : Math.floor(Math.random() * 20) + 1;
        const prefix = this.settings.godMode ? "\x1b[91m[GOD MODE 🎲]" : "\x1b[93m[Dado 🎲]";
        this.output.writeLine(`${prefix} ${char.name} rolou: ${roll}\x1b[0m`);
        actions.push(`${char.name} tenta: ${action} (Resultado do dado d20: ${roll})`);
      }

      // Chance de evento inesperado ("sal e pimenta") vinda das settings centralizadas
      const unexpectedEvent = Math.random() < this.settings.unexpectedEventChance;
      if (unexpectedEvent && this.settings.debug) {
        this.output.writeLine("\x1b[95m[Destino ✨] Algo inesperado está prestes a acontecer...\x1b[0m");
      }

      this.output.writeLine("\n[Árbitro] Calculando as consequências...");
      const recentHistory = this.settings.arbiterHistoryTurns > 0
        ? state.history.slice(-this.settings.arbiterHistoryTurns)
        : undefined;
      const logicalResolution = await this.llmService.arbitrateLogic(state, actions, recentHistory, state.longTermSummary);
      this.output.writeLine(`\x1b[90m(Resolução Mecânica: ${logicalResolution.replace(/\n/g, ' - ')})\x1b[0m`);

      // Atualiza scratchpad dos NPCs com base na resolução do árbitro
      for (const char of state.characters) {
        if (!char.isPlayer) {
          this.cpuReflectionService.recordArbiterResult(char, state.turnNumber, logicalResolution);
        }
      }

      this.output.writeLine("\n[Narrador] Escrevendo a cena...");
      this.output.writeLine("--------------------------------------------------");
      const outcome = await this.llmService.narrateFiction(state, actions, logicalResolution, this.output, unexpectedEvent);
      this.output.writeLine("\n--------------------------------------------------");

      state.history.push(`Turno ${state.turnNumber}:\nAções: ${actions.join(" | ")}\nNarrativa: ${outcome}`);

      if (state.history.length > this.settings.memoryWindowSize) {
        this.output.writeLine("\n[Motor] Sumarizando memórias antigas...");
        const excessCount = state.history.length - this.settings.memoryWindowSize;
        const oldestTurns = state.history.slice(0, excessCount);
        state.longTermSummary = await this.llmService.summarizeMemory(state.longTermSummary, oldestTurns);
        state.history = state.history.slice(excessCount);
      }

      this.output.writeLine("\n[Motor] Atualizando contexto do mundo...");
      state.worldContext = await this.llmService.updateWorldContext(state.worldContext, outcome);

      this.output.writeLine("[Motor] Extraindo localizações dos personagens...");
      const locations = await this.llmService.extractCharacterLocations(state, outcome);
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
      await this.repository.save(state);

      const continuar = await this.input.question("\nContinuar para o próximo turno? (s/n) ");
      if (continuar.toLowerCase() !== 's') {
        this.output.writeLine("\nJogo salvo no arquivo json. Até a próxima aventura!");
        break;
      }
    }

    this.input.close();
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
    }
    return "(Nenhuma narrativa encontrada no histórico)";
  }

}
