import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { GameState, Character } from "../domain/types.js";
import type { IUserInput, IOutputWriter } from "../domain/ports.js";
import { IStateRepository } from "../infrastructure/JsonStateRepository.js";
import {
  cpuActionSystemPrompt,
  cpuActionHumanPrompt,
  arbiterSystemPrompt,
  arbiterHumanPrompt,
  narratorSystemPrompt,
  narratorHumanPrompt,
  initialContextSystemPrompt,
  initialContextHumanPrompt,
  companionDescriptionSystemPrompt,
  companionDescriptionHumanPrompt,
} from "./prompts.js";

export class GameEngine {
  constructor(
    private readonly input: IUserInput,
    private readonly output: IOutputWriter,
    private readonly repository: IStateRepository,
    private readonly llm: ChatOpenAI
  ) {}

  public async start() {
    this.output.clear();
    this.output.writeLine("=== INICIANDO MOTOR NARRATIVO ===");
    let state = await this.repository.load();

    if (state) {
      const carregar = await this.input.question("Save anterior encontrado! Deseja continuar de onde parou? (s/n): ");
      if (carregar.toLowerCase() === 's') {
        this.output.writeLine(`\nJogo carregado! Gênero: ${state.narrativeStyle} | Estilo de Escrita: ${state.writingStyle} | Turno atual: ${state.turnNumber}`);
        this.output.writeLine(`Contexto Atual: ${state.worldContext}\n`);
      } else {
        state = await this.setupNewGame();
      }
    } else {
      state = await this.setupNewGame();
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
          const cpuAction = await this.decideCpuAction(state, char);
          this.output.write(`\r[CPU - ${char.name}] tenta: ${cpuAction} \n`);
          actions.push(`${char.name} tenta: ${cpuAction}`);
        }
      }

      this.output.writeLine("\n[Árbitro] Calculando as consequências...");
      const logicalResolution = await this.arbitrateLogic(state, actions);
      this.output.writeLine(`\x1b[90m(Resolução Mecânica: ${logicalResolution.replace(/\n/g, ' - ')})\x1b[0m`);

      this.output.writeLine("\n[Narrador] Escrevendo a cena...");
      this.output.writeLine("--------------------------------------------------");
      const outcome = await this.narrateFiction(state, actions, logicalResolution);
      this.output.writeLine("\n--------------------------------------------------");
      
      state.history.push(`Turno ${state.turnNumber}:`);
      state.history.push(`Ações: ${actions.join(" | ")}`);
      state.history.push(`Resultado Mecânico: ${logicalResolution}`);
      state.history.push(`Narrativa: ${outcome}`);
      
      if (state.history.length > 15) {
        state.history = state.history.slice(state.history.length - 15);
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

  private async setupNewGame(): Promise<GameState> {
    this.output.writeLine("\nEscolha o gênero/estilo narrativo da história:");
    this.output.writeLine("1. Fantasia Medieval");
    this.output.writeLine("2. Terror de Sobrevivência (Suspense/Monstros)");
    this.output.writeLine("3. Ação / Sci-Fi Cyberpunk");
    this.output.writeLine("4. Outro (Digite o seu próprio gênero)");
    
    const choice = await this.input.question("\nEscolha uma opção (1-4): ");
    let style = "";
    if (choice === "1") style = "Fantasia Medieval";
    else if (choice === "2") style = "Terror de Sobrevivência";
    else if (choice === "3") style = "Ação / Sci-Fi Cyberpunk";
    else {
      style = await this.input.question("Digite o estilo narrativo desejado (ex: Espacial, Romance Policial): ");
    }

    this.output.writeLine("\nEscolha o tom/estilo de escrita da história:");
    this.output.writeLine("1. Terror Sombrio (Melancólico, tenso e assustador)");
    this.output.writeLine("2. Cômico / Sarcástico (Humorado, irônico e leve)");
    this.output.writeLine("3. Épico / Poético (Grandioso, inspirador e descritivo)");
    this.output.writeLine("4. Realista / Cru (Direto, pragmático e violento)");
    this.output.writeLine("5. Outro (Digite o seu próprio estilo)");

    const toneChoice = await this.input.question("\nEscolha uma opção (1-5): ");
    let writingStyle = "";
    if (toneChoice === "1") writingStyle = "Terror Sombrio";
    else if (toneChoice === "2") writingStyle = "Cômico / Sarcástico";
    else if (toneChoice === "3") writingStyle = "Épico / Poético";
    else if (toneChoice === "4") writingStyle = "Realista / Cru";
    else {
      writingStyle = await this.input.question("Digite o estilo de escrita desejado (ex: Noir, Altamente Descritivo): ");
    }

    this.output.writeLine(`\nGerando cenário inicial dinâmico para Gênero: "${style}" e Tom: "${writingStyle}"...`);
    const worldContext = await this.generateInitialContext(style, writingStyle);
    
    this.output.writeLine(`Gerando detalhes dos personagens que combinam com o gênero e estilo...`);
    const companionDescription = await this.generateCompanionDescription(style, writingStyle);

    const state = await this.createNewGame(style, writingStyle, worldContext, companionDescription);
    this.output.writeLine(`\n==================================================`);
    this.output.writeLine(`Contexto Inicial: ${state.worldContext}`);
    this.output.writeLine(`==================================================\n`);

    return state;
  }

  private async generateInitialContext(style: string, writingStyle: string): Promise<string> {
    const messages = [
      new SystemMessage(initialContextSystemPrompt(writingStyle)),
      new HumanMessage(initialContextHumanPrompt(style, writingStyle)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  private async generateCompanionDescription(style: string, writingStyle: string): Promise<string> {
    const messages = [
      new SystemMessage(companionDescriptionSystemPrompt(writingStyle)),
      new HumanMessage(companionDescriptionHumanPrompt(style, writingStyle)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  public async createNewGame(style: string, writingStyle: string, context: string, companionDesc: string): Promise<GameState> {
    const initialState: GameState = {
      worldContext: context,
      narrativeStyle: style,
      writingStyle: writingStyle,
      turnNumber: 1,
      history: [],
      characters: [
        {
          id: "1",
          name: "Jogador",
          description: "O protagonista controlado pelo jogador humano.",
          personality: "Determinado e adaptável.",
          isPlayer: true
        },
        {
          id: "2",
          name: "Elara",
          description: companionDesc,
          personality: "Furtiva, desconfiada e altamente habilidosa na sua especialidade.",
          isPlayer: false
        }
      ]
    };
    await this.repository.save(initialState);
    return initialState;
  }

  private async decideCpuAction(state: GameState, char: Character): Promise<string> {
    const messages = [
      new SystemMessage(cpuActionSystemPrompt(state, char)),
      new HumanMessage(cpuActionHumanPrompt(state)),
    ];

    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  private async arbitrateLogic(state: GameState, actions: string[]): Promise<string> {
    const messages = [
      new SystemMessage(arbiterSystemPrompt),
      new HumanMessage(arbiterHumanPrompt(state, actions)),
    ];

    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  private async narrateFiction(state: GameState, actions: string[], logicalResolution: string): Promise<string> {
    const messages = [
      new SystemMessage(narratorSystemPrompt(state)),
      new HumanMessage(narratorHumanPrompt(state, actions, logicalResolution)),
    ];

    let fullResponse = "";
    const stream = await this.llm.stream(messages);
    
    for await (const chunk of stream) {
        const text = chunk.content as string;
        this.output.write(text);
        fullResponse += text;
    }

    return fullResponse;
  }
}
