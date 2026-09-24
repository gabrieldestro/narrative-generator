import type { WorldTemplate } from '../../domain/types.js';
import type { LlmService } from '../shared/LlmService.js';
import {
  enrichFieldSystemPrompt,
  enrichFieldHumanPrompt,
  summarizeFieldSystemPrompt,
  summarizeFieldHumanPrompt,
} from '../../domain/prompts/game.js';

export type EnrichAction = 'enrich' | 'summarize';

export class EnrichService {
  constructor(private readonly llmService: LlmService) {}

  async transformField(
    field: string,
    value: string,
    context: Partial<WorldTemplate>,
    action: EnrichAction = 'enrich',
  ): Promise<string> {
    const ctx = {
      narrativeStyle: context.narrativeStyle,
      writingStyle: context.writingStyle,
      worldContext: context.worldContext,
      characters: context.characters,
      locations: context.locations,
      concepts: context.concepts,
    };
    const system = action === 'summarize' ? summarizeFieldSystemPrompt() : enrichFieldSystemPrompt();
    const human =
      action === 'summarize'
        ? summarizeFieldHumanPrompt(field, value ?? '', ctx)
        : enrichFieldHumanPrompt(field, value ?? '', ctx);
    const agent = action === 'summarize' ? 'Resumidor' : 'Enriquecedor';
    const result = await this.llmService.invokePrompts(system, human, agent, 0);
    return result.trim();
  }

  async enrichField(field: string, value: string, context: Partial<WorldTemplate>): Promise<string> {
    return this.transformField(field, value, context, 'enrich');
  }

  async summarizeField(field: string, value: string, context: Partial<WorldTemplate>): Promise<string> {
    return this.transformField(field, value, context, 'summarize');
  }
}
