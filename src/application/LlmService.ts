import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { GameState, Character, GameSettings } from "../domain/types.js";
import { DEFAULT_SETTINGS } from "../domain/types.js";
import type { IOutputWriter } from "../domain/ports.js";
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
  summarizeSystemPrompt,
  summarizeHumanPrompt,
  updateWorldContextSystemPrompt,
  updateWorldContextHumanPrompt,
  extractLocationSystemPrompt,
  extractLocationHumanPrompt,
} from "./prompts.js";

export class LlmService {
  private readonly settings: GameSettings;

  constructor(
    private readonly llm: ChatOpenAI,
    settings: Partial<GameSettings> = {},
  ) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  async generateInitialContext(style: string, writingStyle: string): Promise<string> {
    const messages = [
      new SystemMessage(initialContextSystemPrompt(writingStyle)),
      new HumanMessage(initialContextHumanPrompt(style, writingStyle)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async generatePlayerCharacter(style: string, writingStyle: string, playerName: string): Promise<[string, string]> {
    const messages = [
      new SystemMessage(playerCharacterSystemPrompt(writingStyle)),
      new HumanMessage(playerCharacterHumanPrompt(style, writingStyle, playerName)),
    ];
    const response = await this.llm.invoke(messages);
    return this.parseCharacterResponse(response.content as string);
  }

  async generateCompanionDetails(style: string, writingStyle: string, npcName: string): Promise<[string, string]> {
    const messages = [
      new SystemMessage(companionDescriptionSystemPrompt(writingStyle)),
      new HumanMessage(companionDescriptionHumanPrompt(style, writingStyle, npcName)),
    ];
    const response = await this.llm.invoke(messages);
    return this.parseCharacterResponse(response.content as string);
  }

  async invokePrompts(systemPrompt: string, humanPrompt: string): Promise<string> {
    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async extractCharacterLocations(state: GameState, narration: string): Promise<Record<string, string>> {
    const system = extractLocationSystemPrompt();
    const human = extractLocationHumanPrompt(
      state.characters.map(c => ({ id: c.id, name: c.name, currentLocation: c.currentLocation })),
      narration,
    );

    try {
      const raw = await this.invokePrompts(system, human);
      const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      const parsed = JSON.parse(cleaned);
      const result: Record<string, string> = {};
      for (const char of state.characters) {
        const location = parsed[char.name];
        result[char.name] = typeof location === 'string' && location.length > 0 ? location : char.currentLocation ?? 'local desconhecido';
      }
      return result;
    } catch {
      return {};
    }
  }

  async arbitrateLogic(state: GameState, actions: string[], recentHistory?: string[], longTermSummary?: string): Promise<string> {
    const messages = [
      new SystemMessage(arbiterSystemPrompt),
      new HumanMessage(arbiterHumanPrompt(state, actions, recentHistory, longTermSummary)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async generateInitialNarrative(state: GameState): Promise<string> {
    const messages = [
      new SystemMessage(initialNarrativeSystemPrompt(state)),
      new HumanMessage(initialNarrativeHumanPrompt(state)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async narrateFiction(
    state: GameState,
    actions: string[],
    logicalResolution: string,
    output?: IOutputWriter,
    unexpectedEventTriggered?: boolean
  ): Promise<string> {
    const sizePrompt = this.settings.narrationSizePrompts[this.settings.narrationSize];
    const messages = [
      new SystemMessage(narratorSystemPrompt(state, sizePrompt, unexpectedEventTriggered)),
      new HumanMessage(narratorHumanPrompt(state, actions, logicalResolution)),
    ];
    let fullResponse = "";
    const stream = await this.llm.stream(messages);

    for await (const chunk of stream) {
      const text = chunk.content as string;
      if (output) output.write(text);
      fullResponse += text;
    }

    return fullResponse;
  }

  async summarizeMemory(longTermSummary: string | undefined, oldestTurns: string[]): Promise<string> {
    const messages = [
      new SystemMessage(summarizeSystemPrompt()),
      new HumanMessage(summarizeHumanPrompt(longTermSummary, oldestTurns)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async updateWorldContext(currentContext: string, lastNarration: string): Promise<string> {
    const messages = [
      new SystemMessage(updateWorldContextSystemPrompt()),
      new HumanMessage(updateWorldContextHumanPrompt(currentContext, lastNarration)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  private parseCharacterResponse(text: string): [string, string] {
    const descMatch = text.match(/Descrição:\s*(.+)/i);
    const persMatch = text.match(/Personalidade:\s*(.+)/i);
    const description = descMatch ? descMatch[1]!.trim() : text.trim();
    const personality = persMatch ? persMatch[1]!.trim() : "Personalidade adaptável e determinada.";
    return [description, personality];
  }
}
