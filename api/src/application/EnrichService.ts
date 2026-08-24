import type { WorldTemplate } from '../domain/types.js';
import type { LlmService } from './LlmService.js';
import { enrichFieldSystemPrompt, enrichFieldHumanPrompt } from './prompts.js';

export class EnrichService {
  constructor(private readonly llmService: LlmService) {}

  async enrichField(field: string, value: string, context: Partial<WorldTemplate>): Promise<string> {
    const system = enrichFieldSystemPrompt();
    const human = enrichFieldHumanPrompt(field, value ?? '', {
      narrativeStyle: context.narrativeStyle,
      writingStyle: context.writingStyle,
      worldContext: context.worldContext,
      characters: context.characters,
      locations: context.locations,
      concepts: context.concepts,
    });
    const result = await this.llmService.invokePrompts(system, human, 'Enriquecedor', 0);
    return result.trim();
  }
}
