import type { GameState, Character } from "../domain/types.js";
import type { IUserInput, IOutputWriter } from "../domain/ports.js";
import type { IStateRepository } from "../infrastructure/JsonStateRepository.js";
import type { LlmService } from "./LlmService.js";
import type { SessionFactory } from "./SessionFactory.js";

export class GameEngine {
  constructor(
    private readonly input: IUserInput,
    private readonly output: IOutputWriter,
    private readonly repository: IStateRepository,
    private readonly llmService: LlmService,
    private readonly sessionFactory?: SessionFactory,
    private readonly memoryWindowSize: number = 10
  ) {}

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
        if (char.isPlayer) {
          const action = await this.input.question(`[Você - ${char.name}]: O que você tenta fazer? `);
          actions.push(`${char.name} tenta: ${action}`);
        } else {
          this.output.write(`[CPU - ${char.name}] está pensando...`);
          const cpuAction = await this.llmService.decideCpuAction(state, char);
          this.output.write(`\r[CPU - ${char.name}] tenta: ${cpuAction} \n`);
          actions.push(`${char.name} tenta: ${cpuAction}`);
        }
      }

      this.output.writeLine("\n[Árbitro] Calculando as consequências...");
      const logicalResolution = await this.llmService.arbitrateLogic(state, actions);
      this.output.writeLine(`\x1b[90m(Resolução Mecânica: ${logicalResolution.replace(/\n/g, ' - ')})\x1b[0m`);

      this.output.writeLine("\n[Narrador] Escrevendo a cena...");
      this.output.writeLine("--------------------------------------------------");
      const outcome = await this.llmService.narrateFiction(state, actions, logicalResolution, this.output);
      this.output.writeLine("\n--------------------------------------------------");

      state.history.push(`Turno ${state.turnNumber}:\nAções: ${actions.join(" | ")}\nNarrativa: ${outcome}`);

      if (state.history.length > this.memoryWindowSize) {
        this.output.writeLine("\n[Motor] Sumarizando memórias antigas...");
        const excessCount = state.history.length - this.memoryWindowSize;
        const oldestTurns = state.history.slice(0, excessCount);
        state.longTermSummary = await this.llmService.summarizeMemory(state.longTermSummary, oldestTurns);
        state.history = state.history.slice(excessCount);
      }

      this.output.writeLine("\n[Motor] Atualizando contexto do mundo...");
      state.worldContext = await this.llmService.updateWorldContext(state.worldContext, outcome);

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
