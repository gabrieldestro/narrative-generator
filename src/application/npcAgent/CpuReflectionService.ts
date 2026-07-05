import type { Character, CpuAgentDecision, GameState, ScratchpadEntry } from '../../domain/types.js';
import type { IOutputWriter } from '../../domain/ports.js';
import type { LlmService } from '../LlmService.js';
import {
  cpuReflectionSystemPrompt,
  cpuReflectionHumanPrompt,
} from './CpuAgentPrompts.js';

const MAX_SCRATCHPAD_SIZE = 5;
const MAX_RETRIES = 3;

export class CpuReflectionService {
  constructor(
    private readonly llmService: LlmService,
    private readonly maxScratchpadSize: number = MAX_SCRATCHPAD_SIZE,
    private readonly maxRetries: number = MAX_RETRIES,
  ) {}

  async reflectAndAct(state: GameState, char: Character, output?: IOutputWriter): Promise<CpuAgentDecision> {
    const systemPrompt = cpuReflectionSystemPrompt(state, char);
    const humanPrompt = cpuReflectionHumanPrompt(state);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const raw = await this.llmService.invokePrompts(systemPrompt, attempt > 1
          ? `${humanPrompt}\n\nATENÇÃO: Sua resposta anterior não era um JSON válido. Responda APENAS com o JSON no formato especificado, sem texto extra.`
          : humanPrompt,
        );

        const parsed = this.parseResponse(raw);

        char.currentObjective = parsed.updatedObjective;

        if (output && this.maxRetries > 0) {
          output.writeLine(`\x1b[90m[Raciocínio] ${char.name}: ${parsed.reasoning}\x1b[0m`);
        }

        return parsed;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (output) {
          output.writeLine(`\x1b[91m[Agente] ${char.name}: tentativa ${attempt}/${this.maxRetries} falhou — ${lastError.message}\x1b[0m`);
        }
      }
    }

    throw new Error(
      `CpuReflectionService.reflectAndAct falhou após ${this.maxRetries} tentativas para "${char.name}": ${lastError?.message}`,
    );
  }

  recordArbiterResult(char: Character, turn: number, logicalResolution: string): void {
    if (char.isPlayer) return;

    const objective = char.currentObjective ?? '(sem objetivo definido)';

    const escapedName = this.escapeRegex(char.name);
    const successMatch = logicalResolution.match(new RegExp(`${escapedName}.*?->\\s*Sucesso`, 'i'));
    const failMatch = logicalResolution.match(new RegExp(`${escapedName}.*?->\\s*Falha`, 'i'));

    let result: 'success' | 'failure';
    if (failMatch) {
      result = 'failure';
    } else if (successMatch) {
      result = 'success';
    } else {
      return;
    }

    const entry: ScratchpadEntry = {
      turn,
      objective,
      action: char.scratchpad?.[char.scratchpad.length - 1]?.action ?? '(ação desconhecida)',
      result,
      reasoning: '',
    };

    if (!char.scratchpad) {
      char.scratchpad = [];
    }
    char.scratchpad.push(entry);

    if (char.scratchpad.length > this.maxScratchpadSize) {
      char.scratchpad = char.scratchpad.slice(-this.maxScratchpadSize);
    }
  }

  private parseResponse(raw: string): CpuAgentDecision {
    const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.reasoning !== 'string' || parsed.reasoning.length === 0) {
      throw new Error('campo "reasoning" ausente ou vazio');
    }
    if (typeof parsed.updatedObjective !== 'string' || parsed.updatedObjective.length === 0) {
      throw new Error('campo "updatedObjective" ausente ou vazio');
    }
    if (typeof parsed.action !== 'string' || parsed.action.length === 0) {
      throw new Error('campo "action" ausente ou vazio');
    }

    return {
      reasoning: parsed.reasoning,
      updatedObjective: parsed.updatedObjective,
      action: parsed.action,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
