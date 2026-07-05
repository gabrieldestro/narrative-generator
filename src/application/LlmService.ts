import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { GameState, Character } from "../domain/types.js";
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
} from "./prompts.js";

export const MAX_NARRATION_TOKENS = 150;
export const MAX_INITIAL_NARRATION_TOKENS = 500;

export class LlmService {
  constructor(private readonly llm: ChatOpenAI) {}

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

  async decideCpuAction(state: GameState, char: Character): Promise<string> {
    return this.invokePrompts(
      `Você é ${char.name}. Aja.`,
      `Contexto: ${state.worldContext}. O que você faz?`,
    );
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
    const bound = this.llm.bind({ maxTokens: MAX_INITIAL_NARRATION_TOKENS });
    const response = await bound.invoke(messages);
    return response.content as string;
  }

  async narrateFiction(
    state: GameState,
    actions: string[],
    logicalResolution: string,
    output?: IOutputWriter,
    unexpectedEventTriggered?: boolean
  ): Promise<string> {
    const messages = [
      new SystemMessage(narratorSystemPrompt(state, unexpectedEventTriggered)),
      new HumanMessage(narratorHumanPrompt(state, actions, logicalResolution)),
    ];

    const bound = this.llm.bind({ maxTokens: MAX_NARRATION_TOKENS });
    let fullResponse = "";
    const stream = await bound.stream(messages);

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
