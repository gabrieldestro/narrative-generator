import type { GameState, Character } from '../../domain/types.js';
import { getSceneDescription } from './SceneContext.js';

export function cpuReflectionSystemPrompt(state: GameState, char: Character): string {
  const sceneDesc = getSceneDescription(state, char);

  const parts: string[] = [
    `Você é o personagem ${char.name}.`,
    `Sua descrição: ${char.description}.`,
    `Sua personalidade: ${char.personality}.`,
    `Gênero da história: ${state.narrativeStyle}.`,
    `Estilo de escrita/tom: ${state.writingStyle}.`,
    `Cenário do mundo: ${state.worldContext}.`,
    sceneDesc,
  ];

  if (char.longTermObjective) {
    parts.push(`SEU OBJETIVO DE LONGO PRAZO: ${char.longTermObjective}`);
  }

  if (char.currentObjective) {
    parts.push(`SEU OBJETIVO ATUAL (curto prazo): ${char.currentObjective}`);
  }

  if (char.scratchpad && char.scratchpad.length > 0) {
    parts.push('SEU DIÁRIO DE BORDO (histórico das últimas tentativas):');
    for (const entry of char.scratchpad) {
      parts.push(`- Turno ${entry.turn}: queria "${entry.objective}". Tentou: "${entry.action}". Resultado: ${entry.result}. Análise: ${entry.reasoning}`);
    }
  }

  if (state.longTermSummary) {
    parts.push(`Memória de Longo Prazo (resumo dos eventos anteriores): ${state.longTermSummary}`);
  }

  parts.push(
    `INSTRUÇÕES — reflita antes de agir:`,
    `1. Analise seu DIÁRIO DE BORDO. O que funcionou? O que falhou? Por quê?`,
    `2. Se está repetindo a mesma abordagem e falhando, MUDE DE ESTRATÉGIA. Tente algo radicalmente diferente.`,
    `3. Seja PROATIVO — não espere os outros agirem. Tome iniciativas que movam a história para frente.`,
    `4. Você PODE interagir com outros personagens presentes no mesmo local — iniciar diálogo, fazer perguntas, propor alianças, provocar conflitos, ajudar, ameaçar, etc.`,
    `5. Você TAMBÉM pode agir sobre o ambiente (explorar, usar objetos, se mover para outro local, etc.).`,
    `6. Sua ação deve usar verbos de intenção (ex: "Eu pergunto a Elara sobre o artefato", "Eu tento hackear o terminal", "Eu saco minha espada", "Eu vou para o salão norte").`,
    `7. Responda APENAS em JSON válido, sem texto extra antes ou depois:`,
    `{`,
    `  "reasoning": "reflexão interna sobre o que deu certo/errado e a decisão que tomou",`,
    `  "updatedObjective": "objetivo de curto prazo revisado para este turno com base na sua reflexão",`,
    `  "action": "ação em português usando verbos de intenção"`,
    `}`,
  );

  return parts.join('\n');
}

export function cpuReflectionHumanPrompt(state: GameState): string {
  const historyContext = state.history.length > 0
    ? state.history.join('\n\n')
    : '(Nenhum evento anterior ainda. Você está no início da aventura.)';
  return [
    `Contexto Recente:\n${historyContext}`,
    '',
    'Reflita sobre seu objetivo, as tentativas passadas e decida sua ação agora. Responda APENAS com o JSON.',
  ].join('\n');
}
