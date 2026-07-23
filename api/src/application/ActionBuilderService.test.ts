import { describe, it, expect } from 'vitest';
import { ActionBuilderService } from './ActionBuilderService.js';
import type { PlayerActionPayload } from '../domain/types.js';

describe('ActionBuilderService', () => {
  it('should return raw text when actionType and actionIntent are undefined', () => {
    const payload: PlayerActionPayload = {
      playerText: 'Apenas entro na sala em silêncio',
    };

    const result = ActionBuilderService.buildActionString(payload);
    expect(result).toBe('Apenas entro na sala em silêncio');
  });

  it('should enrich action with actionType and actionIntent context', () => {
    const payload: PlayerActionPayload = {
      actionType: 'speak',
      actionIntent: 'intimidating',
      playerText: 'onde está o artefato?',
    };

    const result = ActionBuilderService.buildActionString(payload);
    expect(result).toBe('O personagem se dirige a alguém tentando intimidar ou pressionar: "onde está o artefato?"');
  });

  it('should enrich action with actionType only when intent is neutral', () => {
    const payload: PlayerActionPayload = {
      actionType: 'observe',
      actionIntent: 'neutral',
      playerText: 'examino o baú de madeira',
    };

    const result = ActionBuilderService.buildActionString(payload);
    expect(result).toBe('O personagem para e analisa atentamente a situação: "examino o baú de madeira"');
  });
});
