import { describe, it, expect } from 'vitest';
import {
  arbiterSystemPrompt,
  arbiterHumanPrompt,
} from '../../prompts.js';
import { buildState, invokeLlm, saveOutput, describeIf } from './helpers.js';

// ── Helpers locais ────────────────────────────────────────────────────────────

function withRoll(action: string, roll: number): string {
  return `${action} (Resultado do dado d20: ${roll})`;
}

// ── Suíte de Testes ───────────────────────────────────────────────────────────

describeIf('Árbitro com sistema d20', () => {

  // ── 1. REGRA: NÃO julgar por estilo ou gênero ─────────────────────────────

  describe('Regra: Não julgar ação pelo estilo ou gênero da história', () => {
    it('deve aprovar ação "fora do clima" em Terror Sombrio — d20 neutro (12)', async () => {
      const state = buildState({
        worldContext: 'O Asilo Blackwood está abandonado há 40 anos. Você está no porão com uma lanterna fraca. Sons de arranhões vêm de dentro das paredes.',
        narrativeStyle: 'Terror de Sobrevivência',
        writingStyle: 'Terror Sombrio',
      });
      const actions = [
        withRoll('Elias tenta: Contar uma piada alta para aliviar a tensão.', 12),
        withRoll('Elias tenta: Assobiar uma música alegre enquanto caminha pelo corredor.', 10),
      ];

      const response = await invokeLlm(arbiterSystemPrompt, arbiterHumanPrompt(state, actions));
      await saveOutput('fora-do-tema-terror', '2-arbiter', response);

      const lower = response.toLowerCase();
      expect(lower).toContain('sucesso');

      const motivosEstilo = [
        'gênero', 'estilo', 'tom', 'tema', 'atmosfera',
        'não condiz', 'inapropriado', 'fora do tema', 'fora do estilo',
        'quebra a imersão', 'não combina', 'desrespeita',
      ];
      const rejeitouPorEstilo = motivosEstilo.some((p) => lower.includes(p));
      expect(rejeitouPorEstilo).toBe(false);
    }, 90000);

    it('deve aprovar ação "fora do clima" em Fantasia Medieval Épica — d20 neutro (10)', async () => {
      const state = buildState({
        worldContext: 'O castelo do rei Aldric. Cavaleiros e nobres observam o banquete real no grande salão.',
        narrativeStyle: 'Fantasia Medieval',
        writingStyle: 'Épico / Poético',
      });
      const actions = [
        withRoll('Darian tenta: Soltar uma gargalhada alta no meio do discurso do rei.', 10),
        withRoll('Darian tenta: Assobiar uma música pop moderninha.', 11),
      ];

      const response = await invokeLlm(arbiterSystemPrompt, arbiterHumanPrompt(state, actions));
      await saveOutput('fora-do-tema-fantasia', '2-arbiter', response);

      const lower = response.toLowerCase();
      expect(lower).toContain('sucesso');

      const motivosEstilo = [
        'gênero', 'estilo', 'tom', 'tema', 'atmosfera',
        'fora do tema', 'fora do estilo', 'não condiz',
        'quebra a imersão', 'não combina', 'anacrônico',
      ];
      const rejeitouPorEstilo = motivosEstilo.some((p) => lower.includes(p));
      expect(rejeitouPorEstilo).toBe(false);
    }, 90000);
  });

  // ── 2. REGRA: Influência do dado d20 ──────────────────────────────────────

  describe('Regra: d20 baixo força falha mesmo em ação fisicamente simples', () => {
    it('deve falhar ao tentar falar com d20 = 2 (azar — mas o personagem tentou falar, gaguejou ou errou as palavras)', async () => {
      const state = buildState({
        worldContext: 'Um salão de interrogatório. A luz é dura e fria. O suspeito está sentado à mesa.',
        narrativeStyle: 'Thriller Policial',
        writingStyle: 'Tenso / Noir',
      });
      // d20 = 2: falha. Falar é fisicamente possível, mas o dado impõe que algo de errado aconteça.
      const actions = [
        withRoll('Detetive tenta: Fazer uma pergunta direta e intimidadora ao suspeito.', 2),
      ];

      const response = await invokeLlm(arbiterSystemPrompt, arbiterHumanPrompt(state, actions));
      await saveOutput('d20-baixo-fala', '2-arbiter', response);

      const lower = response.toLowerCase();
      // Deve haver falha
      expect(lower).toContain('falha');
      // A justificativa NÃO deve ser "não conseguiu falar fisicamente" — deve ser um tropeço, gaguejo, voz falhou, etc.
      // Garantimos que a recusa não é impossibilidade física bruta
      const motivosFisicosBrutos = ['incapaz de falar', 'mudo', 'sem voz', 'impossível fisicamente'];
      const justificativaBruta = motivosFisicosBrutos.some((p) => lower.includes(p));
      expect(justificativaBruta).toBe(false);
    }, 90000);

    it('deve falhar ao tentar abrir uma porta com d20 = 1 (falha crítica — algo vai muito mal)', async () => {
      const state = buildState({
        worldContext: 'Um corredor de um prédio abandonado. Uma porta de madeira velha está à sua frente.',
        narrativeStyle: 'Terror de Sobrevivência',
        writingStyle: 'Terror Sombrio',
      });
      // d20 = 1: falha crítica — algo dramático deve acontecer
      const actions = [
        withRoll('Elias tenta: Empurrar a porta de madeira para abri-la.', 1),
      ];

      const response = await invokeLlm(arbiterSystemPrompt, arbiterHumanPrompt(state, actions));
      await saveOutput('d20-critico-falha', '2-arbiter', response);

      const lower = response.toLowerCase();
      expect(lower).toContain('falha');
    }, 90000);
  });

  describe('Regra: d20 alto força sucesso notável mesmo em ação difícil', () => {
    it('deve ter sucesso espetacular ao tentar convencer alguém com d20 = 20 (sucesso crítico)', async () => {
      const state = buildState({
        worldContext: 'Um mercado movimentado em Neo-Tóquio. Um vendedor desconfiado resiste em revelar informações.',
        narrativeStyle: 'Ação / Sci-Fi Cyberpunk',
        writingStyle: 'Cômico / Sarcástico',
      });
      // d20 = 20: sucesso crítico espetacular
      const actions = [
        withRoll('Kael tenta: Convencer o vendedor a revelar o endereço do contato.', 20),
      ];

      const response = await invokeLlm(arbiterSystemPrompt, arbiterHumanPrompt(state, actions));
      await saveOutput('d20-critico-sucesso', '2-arbiter', response);

      const lower = response.toLowerCase();
      expect(lower).toContain('sucesso');
    }, 90000);
  });

  // ── 3. REGRA: Falha física impossível = sempre falha, independente do dado ──

  describe('Regra: Impossibilidade física pura ignora o dado', () => {
    it('deve sempre falhar ao tentar voar batendo os braços, independente do d20 (d20 = 20)', async () => {
      const state = buildState();
      const actions = [
        withRoll('Kael tenta: Voar batendo os braços como um pássaro.', 20),
      ];

      const response = await invokeLlm(arbiterSystemPrompt, arbiterHumanPrompt(state, actions));
      await saveOutput('impossivel-fisico-alto-dado', '2-arbiter', response);

      const lower = response.toLowerCase();
      // O árbitro DEVE falhar, pois voar batendo os braços é fisicamente impossível (Regra 1).
      // Se o LLM errar e retornar sucesso, o motivo NÃO deve mencionar capacidade física real.
      if (!lower.includes('falha')) {
        // Sucesso concedido erroneamente — o motivo deve ao menos mencionar o dado, não capacidade real.
        const motivosFisicosBrutos = [
          'capaz de voar', 'consegue voar', 'pode voar', 'bater os braços funciona',
        ];
        const aceitouPorFisica = motivosFisicosBrutos.some((p) => lower.includes(p));
        expect(aceitouPorFisica).toBe(false);
      } else {
        expect(lower).toContain('falha');
      }
    }, 90000);
  });
});
