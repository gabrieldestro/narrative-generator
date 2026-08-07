import { describe, it, expect } from 'vitest';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { SelfHealingService } from '../../selfHealing/SelfHealingService.js';
import { validateCharacterSheet, validateLocationMap } from '../../selfHealing/JsonValidators.js';
import {
  CHARACTER_SHEET_FORMAT_SPEC,
  LOCATION_MAP_FORMAT_SPEC,
} from '../../prompts.js';
import { buildState, buildLlm, invokeLlm, saveOutput, describeIf } from './helpers.js';

describeIf('Self-Healing com LLM real (LM Studio)', () => {

  describe('Cenário B — reparo de JSON inválido', () => {
    it('deve reparar uma resposta em prosa (não-JSON) em uma ficha de personagem válida', async () => {
      const invalidRaw = await invokeLlm(
        'Você é um contador de histórias.',
        'Escreva uma anedota curta em prosa sobre um mercenário chamado Ghost, sem usar JSON.',
      );
      await saveOutput('self-healing', '1-ficha-resposta-invalida', invalidRaw);

      const stripped = invalidRaw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      expect(() => JSON.parse(stripped)).toThrow();

      const service = new SelfHealingService(buildLlm() as any);
      const healed = await service.parseWithRepair({
        agent: 'Extrator:Ficha',
        turn: 1,
        raw: invalidRaw,
        schemaSpec: CHARACTER_SHEET_FORMAT_SPEC,
        validate: validateCharacterSheet,
      });

      expect(healed).not.toBeNull();
      const value = healed!.value as Record<string, string>;
      await saveOutput('self-healing', '2-ficha-reparada', JSON.stringify(value, null, 2));

      expect(typeof value.name).toBe('string');
      expect(typeof value.description).toBe('string');
      expect(typeof value.personality).toBe('string');
      expect(typeof value.currentLocation).toBe('string');
    }, 180000);

    it('deve reparar um mapa de localizações em formato incorreto (array em vez de objeto)', async () => {
      const invalidRaw = '["Kael", "O Bar do Raio Enferrujado", "Ghost", "A rua"]';
      const service = new SelfHealingService(buildLlm() as any);

      const healed = await service.parseWithRepair({
        agent: 'Extrator:Localização',
        turn: 1,
        raw: invalidRaw,
        schemaSpec: LOCATION_MAP_FORMAT_SPEC,
        validate: validateLocationMap,
        compact: true,
      });

      expect(healed).not.toBeNull();
      await saveOutput('self-healing', '3-localizacao-reparada', JSON.stringify(healed!.value, null, 2));
    }, 180000);
  });

  describe('Cenário A — estouro de contexto', () => {
    it('deve reduzir o histórico na escada quando o prompt estoura a janela e completar', async () => {
      const state = buildState();
      const hugeHistory = Array.from(
        { length: 300 },
        (_, i) => `Turno ${i + 1}: Kael percorreu o distrito neon sob a chuva ácida, anotando pistas sobre o artefato desaparecido e interrogando contatos que, um a um, se mostravam inúteis.`,
      );
      const service = new SelfHealingService(buildLlm() as any, undefined, undefined, { maxHealRetries: 10 });

      const result = await service.invokeWithRetry({
        agent: 'Árbitro',
        turn: state.turnNumber,
        maxBudget: hugeHistory.length,
        minBudget: 0,
        budgetStep: 25,
        maxRetries: 10,
        build: (budget) => [
          new SystemMessage('Você é uma máquina de regras de RPG. Responda apenas a avaliação de sucesso ou falha.'),
          new HumanMessage(
            `Histórico:\n${hugeHistory.slice(-budget).join('\n')}\n\n` +
            'Ações: Kael tentou forçar a fechadura -> Avalie o resultado.',
          ),
        ],
      });

      expect(result.length).toBeGreaterThan(0);
      await saveOutput('self-healing', '4-contexto-recuperado', result);
    }, 180000);
  });
});
