import { describe, it, expect, vi } from 'vitest';
import { EnrichService } from '../EnrichService.js';

describe('EnrichService.enrichField', () => {
  it('monta o prompt com o contexto dos outros campos e retorna o texto enriquecido', async () => {
    const mockLlm = {
      invokePrompts: vi.fn().mockResolvedValue('Uma descrição muito mais rica e detalhada.'),
    };
    const service = new EnrichService(mockLlm as any);

    const result = await service.enrichField(
      'Descrição de Aria',
      'Ladina',
      {
        narrativeStyle: 'Fantasia',
        writingStyle: 'Épico',
        worldContext: 'Mundo sombrio',
        characters: [{ name: 'Aria', description: 'Ladina' }],
        locations: [{ name: 'Taverna' }],
        concepts: [{ name: 'Amuleto', type: 'item' }],
      } as any,
    );

    expect(result).toContain('rica');
    expect(mockLlm.invokePrompts).toHaveBeenCalledTimes(1);

    const [system, human, agent] = mockLlm.invokePrompts.mock.calls[0]!;
    expect(agent).toBe('Enriquecedor');
    expect(human).toContain('Descrição de Aria');
    expect(human).toContain('Ladina');
    expect(human).toContain('Fantasia');
    expect(human).toContain('Mundo sombrio');
    expect(human).toContain('Aria');
    expect(human).toContain('Taverna');
    expect(human).toContain('Amuleto');
  });
});
