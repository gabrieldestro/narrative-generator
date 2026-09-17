import type { GameState, SceneDelta } from "../../../domain/types.js";
import type { LlmClient } from "../../shared/LlmClient.js";
import type { IStructuredResolver } from "../../shared/StructuredResolver.js";
import { validateSceneDelta, normalizeSceneDelta, type NormalizedSceneDelta } from "../../shared/selfHealing/JsonValidators.js";
import { ExtractorBase } from "./ExtractorBase.js";
import {
  SCENE_FORMAT_SPEC,
  SCENE_SYSTEM_PROMPT,
  sceneHumanPrompt,
} from "../../../domain/prompts/extractors/scene.js";

/**
 * Cena-extrator (doc 27, Fase 4 — §6.3/§7.2).
 * Roda fora do caminho crítico (1x por turno, fim de cena). Grounding +
 * evidência de morte/perda + slug de `id` vivem na fusão
 * (`WorldService.applySceneUpdates`).
 */
export class SceneService extends ExtractorBase<SceneDelta> {
  readonly formatSpec = SCENE_FORMAT_SPEC;
  readonly temperature = 0.0;

  constructor(
    private readonly client: LlmClient,
    private readonly resolver: IStructuredResolver,
  ) {
    super();
  }

  /** Cena sempre roda (não há pré-filtro confiável para "local novo"). */
  hasSignal(_narration: string): boolean {
    return true;
  }

  validate(value: unknown): value is SceneDelta {
    return validateSceneDelta(value);
  }

  async extract(state: GameState, sceneNarration: string): Promise<NormalizedSceneDelta> {
    const healed = await this.resolver.resolveJson({
      agent: 'Extrator:Cena',
      turn: state.turnNumber,
      system: SCENE_SYSTEM_PROMPT,
      human: sceneHumanPrompt(state, sceneNarration),
      schemaSpec: this.formatSpec,
      validate: validateSceneDelta,
      compact: true,
    });
    if (!healed) return normalizeSceneDelta({});
    return normalizeSceneDelta(healed.value);
  }

  getClient(): LlmClient {
    return this.client;
  }
}
