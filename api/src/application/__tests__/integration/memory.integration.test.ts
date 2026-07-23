import { describe, it, expect } from 'vitest';
import {
  summarizeSystemPrompt,
  summarizeHumanPrompt,
  updateWorldContextSystemPrompt,
  updateWorldContextHumanPrompt,
} from '../../prompts.js';
import { invokeLlm, saveOutput, describeIf } from './helpers.js';

describeIf('Memória Narrativa e Contexto de Mundo com LLM real (LM Studio)', () => {
  it('deve sumarizar o histórico antigo acumulando com o resumo anterior', async () => {
    const oldSummary = 'O jogador e Elara investigaram um corredor escuro no asilo abandonado.';
    const oldestTurns = [
      'Turno 3:\nAções: Jogador tenta: abrir a porta trancada do escritório | Elara tenta: vigiar o corredor\nNarrativa: Com um estalo, a fechadura cede. O escritório está coberto de poeira e contém uma mesa de carvalho com papéis amarelados.',
      'Turno 4:\nAções: Jogador tenta: examinar os papéis na mesa | Elara tenta: vasculhar as gavetas\nNarrativa: Os papéis revelam experimentos médicos secretos conduzidos em 1984. Elara encontra uma chave de latão brilhante em uma gaveta secreta.'
    ];

    const systemPrompt = summarizeSystemPrompt();
    const humanPrompt = summarizeHumanPrompt(oldSummary, oldestTurns);

    const summaryResponse = await invokeLlm(systemPrompt, humanPrompt);
    await saveOutput('memoria', '1-resumo', summaryResponse);

    expect(summaryResponse.length).toBeGreaterThan(15);
    
    // O resumo deve conter menções aos pontos chave (ex: papéis, chave, experimentos ou escritório)
    const lowerSummary = summaryResponse.toLowerCase();
    const contemPontosChave = 
      lowerSummary.includes('experimento') || 
      lowerSummary.includes('papéis') || 
      lowerSummary.includes('chave') || 
      lowerSummary.includes('escritório') ||
      lowerSummary.includes('elara') ||
      lowerSummary.includes('asilo');
    
    expect(contemPontosChave).toBe(true);
  }, 60000);

  it('deve extrair e atualizar o contexto do cenário baseado na última narrativa', async () => {
    const currentContext = 'Os aventureiros estão no escritório empoeirado do diretor do asilo, com uma mesa de carvalho.';
    const lastNarration = 'Ao pegar a chave de latão, a estante de livros na parede range e desliza para o lado, revelando uma passagem secreta escura que desce em direção ao subsolo, exalando um cheiro forte de mofo.';

    const systemPrompt = updateWorldContextSystemPrompt();
    const humanPrompt = updateWorldContextHumanPrompt(currentContext, lastNarration);

    const contextResponse = await invokeLlm(systemPrompt, humanPrompt);
    await saveOutput('memoria', '2-contexto-mundo', contextResponse);

    expect(contextResponse.length).toBeGreaterThan(15);
    
    // O novo contexto do mundo deve mencionar a passagem secreta ou o subsolo revelados
    const lowerContext = contextResponse.toLowerCase();
    const contemRevelacao = 
      lowerContext.includes('passagem') || 
      lowerContext.includes('secreta') || 
      lowerContext.includes('subsolo') ||
      lowerContext.includes('estante');
      
    expect(contemRevelacao).toBe(true);
  }, 60000);
});
