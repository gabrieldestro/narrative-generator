import { describe, it, expect } from 'vitest';
import {
  extractLocationSystemPrompt,
  extractLocationHumanPrompt,
} from '../../game.js';
import { invokeLlm, saveOutput, describeIf } from './helpers.js';

describeIf('Extração de Localização dos Personagens com LLM real (LM Studio)', () => {

  it('deve extrair localização para personagens que se mudaram de local', async () => {
    const characters = [
      { id: '1', name: 'Darian', currentLocation: 'Salão Principal do Castelo' },
      { id: '2', name: 'Elara', currentLocation: 'Salão Principal do Castelo' },
    ];
    const narration = 'Darian atravessou o pátio iluminado por tochas e adentrou a masmorra úmida, onde as correntes pendem das paredes de pedra. Elara permaneceu no salão, observando as tapeçarias que retratam batalhas antigas.';

    const response = await invokeLlm(
      extractLocationSystemPrompt(),
      extractLocationHumanPrompt(characters, narration),
    );
    await saveOutput('localizacao', '1-mudanca', response);

    let parsed: Record<string, string>;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    expect(typeof parsed.Darian).toBe('string');
    expect(typeof parsed.Elara).toBe('string');

    const lowerDarian = (parsed.Darian ?? '').toLowerCase();
    const lowerElara = (parsed.Elara ?? '').toLowerCase();
    expect(lowerDarian).toMatch(/masmorra|subsolo|calabouço|porão/);
    expect(lowerElara).toMatch(/salão|salão principal|castelo|tapeçaria/);
  }, 60000);

  it('deve manter localização anterior quando personagens não se movem', async () => {
    const characters = [
      { id: '1', name: 'Kael', currentLocation: 'Bar do Jake, Distrito Neon' },
      { id: '2', name: 'Ghost', currentLocation: 'Bar do Jake, Distrito Neon' },
    ];
    const narration = 'Kael pediu outra dose de uísque sintético enquanto observava a porta. Ghost permaneceu na mesa dos fundos, dedos tamborilando no teclado holográfico. Nenhum dos dois deixou o bar.';

    const response = await invokeLlm(
      extractLocationSystemPrompt(),
      extractLocationHumanPrompt(characters, narration),
    );
    await saveOutput('localizacao', '2-mesmo-local', response);

    let parsed: Record<string, string>;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    expect(parsed.Kael?.toLowerCase()).toMatch(/bar|neon|jake|distrito/);
    expect(parsed.Ghost?.toLowerCase()).toMatch(/bar|neon|jake|distrito/);
  }, 60000);

  it('deve extrair novo local único quando todos os personagens se mudam para o mesmo lugar', async () => {
    const characters = [
      { id: '1', name: 'Elias', currentLocation: 'Salão Principal da Mansão Blackwood' },
      { id: '2', name: 'Morgana', currentLocation: 'Salão Principal da Mansão Blackwood' },
    ];
    const narration = 'Os dois atravessaram o corredor escuro juntos, passando pela porta dos fundos, e entraram na biblioteca. O cheiro de mofo e papel velho preenchia o ar. Elias acendeu um fósforo para iluminar as estantes repletas de livros empoeirados.';

    const response = await invokeLlm(
      extractLocationSystemPrompt(),
      extractLocationHumanPrompt(characters, narration),
    );
    await saveOutput('localizacao', '3-mesmo-novo-local', response);

    let parsed: Record<string, string>;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    const lowerElias = (parsed.Elias ?? '').toLowerCase();
    const lowerMorgana = (parsed.Morgana ?? '').toLowerCase();
    expect(lowerElias).toMatch(/biblioteca|salão de leitura|arquivo|estante|livro/);
    expect(lowerMorgana).toMatch(/biblioteca|salão de leitura|arquivo|estante|livro/);
    expect(parsed.Elias).toBe(parsed.Morgana);
  }, 60000);

  it('deve extrair múltiplos destinos quando cada personagem vai para um local diferente', async () => {
    const characters = [
      { id: '1', name: 'Elias', currentLocation: 'Salão Principal da Mansão Blackwood' },
      { id: '2', name: 'Morgana', currentLocation: 'Salão Principal da Mansão Blackwood' },
    ];
    const narration = 'Elias subiu as escadas rangendo até o segundo andar, encontrando o quarto dos fundos coberto de teias de aranha. Morgana desceu ao porão, onde a porta trancada cedeu sob seu ombro, revelando uma câmara escura com símbolos estranhos no chão.';

    const response = await invokeLlm(
      extractLocationSystemPrompt(),
      extractLocationHumanPrompt(characters, narration),
    );
    await saveOutput('localizacao', '4-destinos-diferentes', response);

    let parsed: Record<string, string>;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    const lowerElias = parsed.Elias?.toLowerCase() ?? '';
    const lowerMorgana = parsed.Morgana?.toLowerCase() ?? '';
    expect(lowerElias).toMatch(/quarto|andar|escada|segundo andar|teia/);
    expect(lowerMorgana).toMatch(/porão|subsolo|câmara|símbolo|selado/);
    expect(parsed.Elias).not.toBe(parsed.Morgana);
  }, 60000);

  it('deve retornar JSON válido mesmo com personagens sem local anterior definido', async () => {
    const characters = [
      { id: '1', name: 'Valentina', currentLocation: undefined },
      { id: '2', name: 'Lilith', currentLocation: undefined },
    ];
    const narration = 'Valentina empurrou a porta metálica da sala de interrogatório. Lilith permaneceu amarrada à cadeira, observando cada movimento da agente.';

    const response = await invokeLlm(
      extractLocationSystemPrompt(),
      extractLocationHumanPrompt(characters, narration),
    );
    await saveOutput('localizacao', '5-sem-local-anterior', response);

    let parsed: Record<string, string>;
    try {
      const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(response);
    }

    expect(parsed).toBeDefined();
    expect(typeof parsed.Valentina).toBe('string');
    expect(typeof parsed.Lilith).toBe('string');
    expect((parsed.Valentina ?? '').length).toBeGreaterThan(3);
  }, 60000);
});
