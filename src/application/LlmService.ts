import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { GameState, Character } from "../domain/types.js";
import type { IOutputWriter } from "../domain/ports.js";
import {
  cpuActionSystemPrompt,
  cpuActionHumanPrompt,
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
} from "./prompts.js";

export const MAX_NARRATION_TOKENS = 500;
export const MAX_INITIAL_NARRATION_TOKENS = 1000;

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

  async decideCpuAction(state: GameState, char: Character): Promise<string> {
    const messages = [
      new SystemMessage(cpuActionSystemPrompt(state, char)),
      new HumanMessage(cpuActionHumanPrompt(state)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async arbitrateLogic(state: GameState, actions: string[]): Promise<string> {
    const messages = [
      new SystemMessage(arbiterSystemPrompt),
      new HumanMessage(arbiterHumanPrompt(state, actions)),
    ];
    const response = await this.llm.invoke(messages);
    return response.content as string;
  }

  async generateInitialNarrative(state: GameState): Promise<string> {
    const messages = [
      new SystemMessage(initialNarrativeSystemPrompt(state)),
      new HumanMessage(initialNarrativeHumanPrompt(state)),
    ];
    const response = await this.llm.invoke(messages, { maxTokens: MAX_INITIAL_NARRATION_TOKENS } as any);
    return response.content as string;
  }

  async narrateFiction(state: GameState, actions: string[], logicalResolution: string, output?: IOutputWriter): Promise<string> {
    const messages = [
      new SystemMessage(narratorSystemPrompt(state)),
      new HumanMessage(narratorHumanPrompt(state, actions, logicalResolution)),
    ];

    let fullResponse = "";
    const stream = await this.llm.stream(messages, { maxTokens: MAX_NARRATION_TOKENS } as any);

    for await (const chunk of stream) {
      const text = chunk.content as string;
      if (output) output.write(text);
      fullResponse += text;
    }

    return fullResponse;
  }

  private parseCharacterResponse(text: string): [string, string] {
    const descMatch = text.match(/Descrição:\s*(.+)/i);
    const persMatch = text.match(/Personalidade:\s*(.+)/i);
    const description = descMatch ? descMatch[1]!.trim() : text.trim();
    const personality = persMatch ? persMatch[1]!.trim() : "Personalidade adaptável e determinada.";
    return [description, personality];
  }
}
