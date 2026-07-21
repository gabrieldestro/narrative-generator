import type { GameState, WorldTemplate, CharacterTemplate, Character, Location } from "../domain/types.js";
import type { IUserInput, IOutputWriter } from "../domain/ports.js";
import type { IStateRepository } from "../infrastructure/JsonStateRepository.js";
import type { WorldTemplateRepository } from "../infrastructure/WorldTemplateRepository.js";
import type { LlmService } from "./LlmService.js";

export class SessionFactory {
  constructor(
    private readonly input?: IUserInput,
    private readonly output?: IOutputWriter,
    private readonly repository?: IStateRepository,
    private readonly llmService?: LlmService,
    private readonly worldTemplateRepo?: WorldTemplateRepository
  ) {}

  public buildFromTemplate(template: WorldTemplate): GameState {
    const characters: Character[] = template.characters.map((c, i) => {
      const character: Character = {
        id: String(i + 1),
        name: c.name,
        description: c.description,
        personality: c.personality,
        isPlayer: c.isPlayer ?? false,
        currentLocation: c.initialLocation ?? 'Ponto de Partida',
        inventory: c.inventory ?? [],
        status: 'active',
      };
      if (c.longTermObjective !== undefined) {
        character.longTermObjective = c.longTermObjective;
        character.currentObjective = c.longTermObjective;
      }
      return character;
    });

    return {
      worldContext: template.worldContext,
      narrativeStyle: template.narrativeStyle,
      writingStyle: template.writingStyle,
      turnNumber: 1,
      history: [],
      characters,
      locations: template.locations ?? [],
    };
  }

  public async buildCustomScenario(
    promptText: string,
    style = "Aventura Customizada",
    writingStyle = "Equilibrado"
  ): Promise<GameState> {
    const worldContext = this.llmService
      ? await this.llmService.generateInitialContext(style, writingStyle)
      : promptText;

    const [playerDesc, playerPersonality] = this.llmService
      ? await this.llmService.generatePlayerCharacter(style, writingStyle, "Heroi")
      : ["Um aventureiro determinado.", "Pragmático e corajoso."];

    const characters: Character[] = [
      {
        id: "1",
        name: "Heroi",
        description: playerDesc,
        personality: playerPersonality,
        isPlayer: true,
        currentLocation: "Ponto de Partida",
        inventory: [],
        status: "active"
      }
    ];

    return {
      worldContext,
      narrativeStyle: style,
      writingStyle,
      turnNumber: 1,
      history: [],
      characters,
      locations: []
    };
  }

  async setupNewGame(): Promise<GameState> {
    if (!this.input || !this.output) {
      throw new Error("CLI Input/Output são necessários para setupNewGame interativo.");
    }

    const templates: WorldTemplate[] = this.worldTemplateRepo
      ? await this.worldTemplateRepo.listAll()
      : [];

    if (templates.length > 0) {
      this.output.writeLine("\nComo você quer iniciar a aventura?");
      this.output.writeLine("1. Escolher um mundo pré-configurado");
      this.output.writeLine("2. Criar um cenário personalizado via IA");

      const mode = await this.input.question("\nEscolha (1-2): ");
      if (mode === '1') {
        return this.selectPreconfiguredWorld(templates);
      }
    }

    return this.createInteractiveCustomScenario();
  }

  async createNewGame(
    style: string,
    writingStyle: string,
    context: string,
    chars: CharacterTemplate[],
    locations: Location[] = []
  ): Promise<GameState> {
    const characters: Character[] = chars.map((c, i) => {
      const character: Character = {
        id: String(i + 1),
        name: c.name,
        description: c.description,
        personality: c.personality,
        isPlayer: c.isPlayer ?? false,
        currentLocation: c.initialLocation ?? 'Ponto de Partida',
        inventory: c.inventory ?? [],
        status: 'active',
      };
      if (c.longTermObjective !== undefined) {
        character.longTermObjective = c.longTermObjective;
        character.currentObjective = c.longTermObjective;
      }
      return character;
    });

    const state: GameState = {
      worldContext: context,
      narrativeStyle: style,
      writingStyle,
      turnNumber: 1,
      history: [],
      characters,
      locations,
    };
    if (this.repository) {
      await this.repository.save(state);
    }
    return state;
  }

  private async selectPreconfiguredWorld(templates: WorldTemplate[]): Promise<GameState> {
    if (!this.input || !this.output) {
      throw new Error("CLI Input/Output são necessários.");
    }

    this.output.writeLine("\n--- Mundos Pré-Configurados ---");
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]!;
      this.output.writeLine(`${i + 1}. ${t.name}`);
      this.output.writeLine(`   ${t.description}`);
    }

    const choice = await this.input.question(`\nEscolha um mundo (1-${templates.length}): `);
    const index = parseInt(choice, 10) - 1;
    const selected = templates[index];

    if (!selected) {
      this.output.writeLine("Opção inválida. Usando configuração personalizada.");
      return this.createInteractiveCustomScenario();
    }

    this.output.writeLine(`\nMundo selecionado: ${selected.name}`);
    const state = await this.createNewGame(
      selected.narrativeStyle,
      selected.writingStyle,
      selected.worldContext,
      selected.characters,
      selected.locations ?? []
    );
    this.output.writeLine(`\n==================================================`);
    this.output.writeLine(`Contexto Inicial: ${state.worldContext}`);
    this.output.writeLine(`==================================================\n`);
    return state;
  }

  private async createInteractiveCustomScenario(): Promise<GameState> {
    if (!this.input || !this.output || !this.llmService) {
      throw new Error("CLI e LLMService são necessários para o cenário interativo.");
    }

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
    const worldContext = await this.llmService.generateInitialContext(style, writingStyle);

    const playerName = await this.input.question("\nQual o nome do seu personagem? ");

    this.output.writeLine(`Gerando detalhes do seu personagem...`);
    const [playerDesc, playerPersonality] = await this.llmService.generatePlayerCharacter(style, writingStyle, playerName);

    const characters: CharacterTemplate[] = [
      { name: playerName, description: playerDesc, personality: playerPersonality, isPlayer: true },
    ];

    while (true) {
      const addNpc = await this.input.question("\nAdicionar um NPC à party? (s/n): ");
      if (addNpc.toLowerCase() !== 's') break;

      const npcName = await this.input.question("Nome do NPC: ");
      const manual = await this.input.question("Preencher descrição e personalidade manualmente? (s/n): ");

      let npcDesc: string;
      let npcPersonality: string;

      if (manual.toLowerCase() === 's') {
        npcDesc = await this.input.question(`Descrição de ${npcName}: `);
        npcPersonality = await this.input.question(`Personalidade de ${npcName}: `);
      } else {
        this.output.writeLine(`Gerando detalhes de ${npcName}...`);
        [npcDesc, npcPersonality] = await this.llmService.generateCompanionDetails(style, writingStyle, npcName);
      }

      characters.push({ name: npcName, description: npcDesc, personality: npcPersonality });
    }

    const state = await this.createNewGame(style, writingStyle, worldContext, characters);
    this.output.writeLine(`\n==================================================`);
    this.output.writeLine(`Contexto Inicial: ${state.worldContext}`);
    this.output.writeLine(`==================================================\n`);

    return state;
  }
}
