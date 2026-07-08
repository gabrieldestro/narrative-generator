import { describe, it, expect } from "vitest";
import { ChatOpenAI } from "@langchain/openai";
import { LlmService } from "../../LlmService.js";
import { GameManagementService } from "../../GameManagementService.js";
import { CpuReflectionService } from "../../npcAgent/CpuReflectionService.js";
import { buildState, LLM_BASE_URL, LLM_API_KEY, describeIf } from "../integration/helpers.js";
import * as fs from "fs/promises";
import * as path from "path";

describeIf("Suíte de Testes End-to-End (E2E) - Narração e Coerência", () => {
  it("deve executar um fluxo complexo de múltiplos turnos e avaliar a coerência e performance do motor via LLM Juiz", async () => {
    const startTime = Date.now();

    const llm = new ChatOpenAI({
      temperature: 0.7,
      model: "gemma-4b",
      apiKey: LLM_API_KEY,
      configuration: { baseURL: LLM_BASE_URL },
    });

    const llmService = new LlmService(llm, { debug: true });
    const gameManagementService = new GameManagementService(llmService);
    const cpuReflectionService = new CpuReflectionService(llmService);

    // 1. Setup Inicial do Estado (Mansão Blackwood)
    let state = buildState({
      narrativeStyle: "Terror de Sobrevivência",
      writingStyle: "Terror Sombrio",
      worldContext: "Mansão Blackwood, 1913. O vento sopra forte sacudindo as janelas quebradas. O salão principal está escuro, com teias de aranha cobrindo os móveis antigos.",
      turnNumber: 1,
      history: [],
      locations: [
        {
          id: "salao_principal",
          name: "Salão Principal da Mansão Blackwood",
          description: "Um grande salão abandonado com uma escadaria e uma lareira fria.",
          connectedTo: ["biblioteca"],
        },
        {
          id: "biblioteca",
          name: "Biblioteca",
          description: "Uma biblioteca trancada por um cadeado enferrujado.",
          connectedTo: ["salao_principal"],
        },
      ],
      characters: [
        {
          id: "1",
          name: "Elias",
          description: "Jornalista investigativo com um sobretudo e um isqueiro.",
          personality: "Curioso e imprudente.",
          isPlayer: true,
          currentLocation: "Salão Principal da Mansão Blackwood",
          inventory: ["Isqueiro de Metal", "Grampo de Cabelo"],
          status: "active",
        },
        {
          id: "2",
          name: "Morgana",
          description: "Investigadora paranormal atenta aos sons do sobrenatural.",
          personality: "Silenciosa, tensa e precavida.",
          isPlayer: false,
          currentLocation: "Salão Principal da Mansão Blackwood",
          inventory: ["Lanterna de Metal"],
          status: "active",
          longTermObjective: "Encontrar pistas sobre os desaparecidos e sobreviver.",
          currentObjective: "Vigiar os arredores.",
          scratchpad: [],
        },
      ],
    });

    const turnMetrics: { turn: number; duration: number }[] = [];

    // ==========================================
    // TURNO 1: Elias tenta arrombar a biblioteca
    // ==========================================
    const t1Start = Date.now();
    const actionsTurn1: string[] = [];

    // Elias (Jogador) tenta abrir a biblioteca
    actionsTurn1.push("Elias tenta usar o grampo de cabelo para arrombar o cadeado enferrujado da Biblioteca.");

    // Morgana (CPU) reflete e decide agir
    const morganaT1 = state.characters.find((c) => c.name === "Morgana")!;
    const morganaT1Decision = await cpuReflectionService.reflectAndAct(state, morganaT1);
    actionsTurn1.push(`Morgana tenta: ${morganaT1Decision.action}`);

    // Adiciona rolagens d20 (God mode ativo para forçar sucesso no arrombamento)
    const actionsWithDiceT1 = [
      `${state.characters[0]!.name} tenta: ${actionsTurn1[0]} (Resultado do dado d20: 20)`,
      `${state.characters[1]!.name} tenta: ${actionsTurn1[1]} (Resultado do dado d20: 12)`,
    ];

    // Arbitragem
    const resolutionT1 = await llmService.arbitrateLogic(state, actionsWithDiceT1);

    // Narração
    const narrationT1 = await llmService.narrateFiction(state, actionsWithDiceT1, resolutionT1);
    state.history.push(`Turno 1:\nAções: ${actionsWithDiceT1.join(" | ")}\nNarrativa: ${narrationT1}`);

    // Extração e atualização de estado automático
    state = await gameManagementService.applyAutomaticStateUpdates(state, narrationT1);
    state.worldContext = await llmService.updateWorldContext(state.worldContext, narrationT1);
    
    // Atualiza localizações
    const locsT1 = await llmService.extractCharacterLocations(state, narrationT1);
    for (const char of state.characters) {
      const loc = locsT1[char.name];
      if (loc) {
        char.currentLocation = loc;
      }
    }
    
    state.turnNumber++;
    turnMetrics.push({ turn: 1, duration: Date.now() - t1Start });

    // ==========================================
    // TURNO 2: Explorando e Evento Inesperado (Surgimento de NPC)
    // ==========================================
    const t2Start = Date.now();
    const actionsTurn2: string[] = [];

    // Elias entra na biblioteca recém-aberta e busca por diários
    actionsTurn2.push("Elias entra na biblioteca e investiga a mesa central procurando por anotações ou diários da família Blackwood.");

    // Morgana (CPU) decide ação baseada na nova cena
    const morganaT2 = state.characters.find((c) => c.name === "Morgana")!;
    const morganaT2Decision = await cpuReflectionService.reflectAndAct(state, morganaT2);
    actionsTurn2.push(`Morgana tenta: ${morganaT2Decision.action}`);

    const actionsWithDiceT2 = [
      `${state.characters[0]!.name} tenta: ${actionsTurn2[0]} (Resultado do dado d20: 18)`,
      `${state.characters[1]!.name} tenta: ${actionsTurn2[1]} (Resultado do dado d20: 10)`,
    ];

    // Arbitragem
    const resolutionT2 = await llmService.arbitrateLogic(state, actionsWithDiceT2);

    // Narração - Forçamos um evento inesperado (Sal e Pimenta) para introduzir um perigo/NPC
    const narrationT2 = await llmService.narrateFiction(state, actionsWithDiceT2, resolutionT2, undefined, true);
    state.history.push(`Turno 2:\nAções: ${actionsWithDiceT2.join(" | ")}\nNarrativa: ${narrationT2}`);

    // Extração e atualização de estado automático (deve detectar novos itens descobertos ou aparições)
    state = await gameManagementService.applyAutomaticStateUpdates(state, narrationT2);
    state.worldContext = await llmService.updateWorldContext(state.worldContext, narrationT2);

    const locsT2 = await llmService.extractCharacterLocations(state, narrationT2);
    for (const char of state.characters) {
      const loc = locsT2[char.name];
      if (loc) {
        char.currentLocation = loc;
      }
    }

    state.turnNumber++;
    turnMetrics.push({ turn: 2, duration: Date.now() - t2Start });

    // ==========================================
    // AVALIAÇÃO DE COERÊNCIA (LLM JUIZ)
    // ==========================================
    const judgePrompt = `
Você é um auditor sênior de qualidade e design de RPGs e Inteligência Artificial. Analise a sequência de turnos executada no teste E2E e forneça um laudo de auditoria completo.

### HISTÓRICO DA AVENTURA:
${state.history.join("\n\n---\n\n")}

### ESTADO FINAL DAS ENTIDADES (MUTADO PELA IA):
Personagens e Inventários:
${state.characters.map((c) => `- ${c.name} [Status: ${c.status}, Local: ${c.currentLocation}]: Inventário: [${c.inventory ? c.inventory.join(", ") : ""}]`).join("\n")}

Localizações no Grafo:
${(state.locations || []).map((l) => `- ${l.name} (${l.id}) conectado a [${l.connectedTo.join(", ")}]`).join("\n")}

### TAREFAS DA AUDITORIA:
1. **Consistência de Ação**: Elias conseguiu arrombar o cadeado no turno 1 e entrar na biblioteca no turno 2? O narrador respeitou o sucesso das rolagens d20 altas?
2. **Autonomia de Companheiro**: A Morgana agiu de forma coerente e independente com base nos seus objetivos?
3. **Extração Dinâmica de RPG**: O inventário dos personagens ou locais conectados mudaram no estado estruturado de forma condizente com o que foi narrado? (Ex: itens recolhidos ou novas conexões de portas abertas foram registrados?).
4. **Veredito Final**: Responda explicitamente "APROVADO" se a integridade mecânica-narrativa foi mantida, ou "REPROVADO" com a lista de falhas.
`;

    const judgeResponse = await llmService.invokePrompts(
      "Você é um juiz auditor de RPG encarregado de validar a coerência lógica e narrativa de simulações.",
      judgePrompt
    );

    // ==========================================
    // GRAVAÇÃO DE RELATÓRIO E MÉTRICAS
    // ==========================================
    const totalTime = Date.now() - startTime;
    const outputDir = path.join(process.cwd(), "test-output");
    await fs.mkdir(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const e2eReport = `
# Relatório de Auditoria de Integração e Coerência E2E (Turnos Complexos)

**Data da Corrida**: ${new Date().toLocaleString()}
**Gênero**: ${state.narrativeStyle} | **Tom**: ${state.writingStyle}

## 1. Métricas de Performance e Benchmark
*   **Tempo de Execução Total**: ${(totalTime / 1000).toFixed(2)}s
*   **Tempo Turno 1**: ${(turnMetrics[0]!.duration / 1000).toFixed(2)}s
*   **Tempo Turno 2**: ${(turnMetrics[1]!.duration / 1000).toFixed(2)}s
*   **Velocidade Média por Turno**: ${((turnMetrics[0]!.duration + turnMetrics[1]!.duration) / 2000).toFixed(2)}s

## 2. Histórico Textual Completo da Aventura
${state.history.map((h, i) => `### Turno ${i + 1}\n${h}`).join("\n\n")}

## 3. Estado Estruturado Final do Jogo
### Personagens Ativos:
${state.characters.map((c) => `*   **${c.name}** (${c.status})
    *   Descrição: ${c.description}
    *   Personalidade: ${c.personality}
    *   Local Atual: ${c.currentLocation}
    *   Inventário: \`[${c.inventory ? c.inventory.join(", ") : ""}]\`
    *   Objetivo Atual: ${c.currentObjective}`).join("\n")}

### Grafo de Mapa Descoberto:
${(state.locations || []).map((l) => `*   **${l.name}** (\`${l.id}\`) -> Conectado a: \`[${l.connectedTo.join(", ")}]\`
    *   Descrição: ${l.description}`).join("\n")}

## 4. Parecer Técnico do LLM Juiz
${judgeResponse}
`;

    const filePath = path.join(outputDir, `${timestamp}_e2e_narration_complex_coherence.md`);
    await fs.writeFile(filePath, e2eReport, "utf-8");

    console.log(`[E2E] Relatório detalhado salvo em: ${filePath}`);

    expect(narrationT1).toBeDefined();
    expect(narrationT2).toBeDefined();
    expect(judgeResponse).toBeDefined();
    expect(judgeResponse.toUpperCase()).toContain("APROVADO");
  }, 600000);
});
