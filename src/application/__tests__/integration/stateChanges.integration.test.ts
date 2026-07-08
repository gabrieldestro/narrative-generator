import { describe, it, expect } from "vitest";
import {
  extractStateChangesSystemPrompt,
  extractStateChangesHumanPrompt,
} from "../../prompts.js";
import { buildState, invokeLlm, saveOutput, describeIf } from "./helpers.js";

describeIf("Extração Automática de Mutações de Estado do RPG com LLM real (LM Studio)", () => {
  it("deve extrair mudanças de inventário quando itens são pegos ou perdidos", async () => {
    const state = buildState({
      characters: [
        {
          id: "1",
          name: "Kael",
          description: "Um contrabandista cibernético com jaqueta de couro gasta.",
          personality: "Pragmático e desconfiado.",
          isPlayer: true,
          currentLocation: "Bar do Jake",
          inventory: ["Pistola a Laser"],
          status: "active",
        },
      ],
      locations: [
        {
          id: "bar_jake",
          name: "Bar do Jake",
          description: "Um bar úmido cheio de criminosos.",
          connectedTo: [],
        },
      ],
    });

    const narration = "Kael guardou a chave de acesso criptografada no bolso da jaqueta, mas acabou deixando cair sua Pistola a Laser no chão enlamaçado enquanto corria do bar.";

    const response = await invokeLlm(
      extractStateChangesSystemPrompt(),
      extractStateChangesHumanPrompt(state, narration)
    );
    await saveOutput("stateChanges", "1-inventario", response);

    let parsed: any;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    expect(parsed.inventoryChanges).toBeInstanceOf(Array);
    
    const added = parsed.inventoryChanges.find((c: any) => c.action === "add");
    const removed = parsed.inventoryChanges.find((c: any) => c.action === "remove");

    expect(added).toBeDefined();
    expect(added.characterName).toBe("Kael");
    expect(added.item.toLowerCase()).toContain("chave");

    expect(removed).toBeDefined();
    expect(removed.characterName).toBe("Kael");
    expect(removed.item.toLowerCase()).toContain("pistola");
  }, 60000);

  it("deve extrair descoberta de novos locais e conexões", async () => {
    const state = buildState({
      characters: [
        {
          id: "1",
          name: "Kael",
          description: "Cyber-contrabandista",
          personality: "Pragmático",
          isPlayer: true,
          currentLocation: "Bar do Jake",
          inventory: [],
          status: "active",
        },
      ],
      locations: [
        {
          id: "bar_jake",
          name: "Bar do Jake",
          description: "Um bar úmido",
          connectedTo: [],
        },
      ],
    });

    const narration = "Ao empurrar uma prateleira de garrafas falsas na parede, Kael revelou um túnel secreto iluminado por neon vermelho chamado Corredor Subterrâneo, abrindo uma rota de fuga do bar.";

    const response = await invokeLlm(
      extractStateChangesSystemPrompt(),
      extractStateChangesHumanPrompt(state, narration)
    );
    await saveOutput("stateChanges", "2-locais", response);

    let parsed: any;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    expect(parsed.locationChanges).toBeDefined();
    expect(parsed.locationChanges.discovered).toBeInstanceOf(Array);
    expect(parsed.locationChanges.discovered.length).toBeGreaterThan(0);

    const discovered = parsed.locationChanges.discovered[0];
    expect(discovered.name.toLowerCase()).toContain("corredor");
    expect(discovered.connectedTo).toContain("bar_jake");
  }, 60000);

  it("deve extrair mortes, perdas ou novos personagens dinamicamente", async () => {
    const state = buildState({
      characters: [
        {
          id: "1",
          name: "Kael",
          description: "Cyber-contrabandista",
          personality: "Pragmático",
          isPlayer: true,
          currentLocation: "Bar do Jake",
          inventory: [],
          status: "active",
        },
        {
          id: "2",
          name: "Morgana",
          description: "Investigadora",
          personality: "Fria",
          isPlayer: false,
          currentLocation: "Bar do Jake",
          inventory: [],
          status: "active",
        },
      ],
      locations: [
        {
          id: "bar_jake",
          name: "Bar do Jake",
          description: "Um bar úmido",
          connectedTo: [],
        },
      ],
    });

    const narration = "Morgana foi atingida em cheio por um tiro de plasma corporativo e caiu sem vida, com os olhos vidrados encarando o teto. De repente, um Mercador Ambulante misterioso, trajando um sobretudo tecnológico e sorriso cínico, emergiu das sombras do salão principal para barganhar.";

    const response = await invokeLlm(
      extractStateChangesSystemPrompt(),
      extractStateChangesHumanPrompt(state, narration)
    );
    await saveOutput("stateChanges", "3-ciclo-vida", response);

    let parsed: any;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    expect(parsed.characterLifecycle).toBeInstanceOf(Array);
    
    const deadMorgana = parsed.characterLifecycle.find(
      (c: any) => c.characterName === "Morgana" && c.status === "dead"
    );
    const newMerchant = parsed.characterLifecycle.find(
      (c: any) => c.status === "discovered"
    );

    expect(deadMorgana).toBeDefined();
    expect(newMerchant).toBeDefined();
    expect(newMerchant.characterName.toLowerCase()).toContain("mercador");
    expect(newMerchant.description).toBeDefined();
    expect(newMerchant.personality).toBeDefined();
  }, 60000);
});
