import { describe, it, expect, vi } from 'vitest';
import { ReactionGateAgent } from '../gate/ReactionGateAgent.js';
import type { GateCandidate, StepAction } from '../../../domain/types.js';

function mockDeps(resolvedValue: unknown | null) {
  const client = { invoke: vi.fn(async () => 'irrelevante') };
  const resolver = { resolveJson: vi.fn(async () => (resolvedValue === null ? null : { value: resolvedValue, attempt: 1 })) };
  return { client, resolver };
}
const BOOM: StepAction = { actor: 'Darian', text: 'explodir barril' };

const WHISPER: StepAction = { actor: 'Darian', text: 'sussurrar o plano' };

// Doc 27, Fase 3 — árbitro de percepção (§6.5).
describe('ReactionGateAgent.gateReactions', () => {
  it('permite explosão cross-room (heard) e nega sussurro sem stake', async () => {
    const { client, resolver } = mockDeps({
      rulings: [
        { who: 'Elara', allow: true, channel: 'heard', why: 'explosão no Pátio é audível no Porão' },
        { who: 'Vulto', allow: false, channel: 'none', why: 'sótão distante' },
      ],
    });
    const agent = new ReactionGateAgent(client as any, resolver as any);
    const candidates: GateCandidate[] = [
      { name: 'Elara', where: 'Porão', isTarget: false, ownsItem: false },
      { name: 'Vulto', where: 'Sótão', isTarget: false, ownsItem: false },
    ];
    const rulings = await agent.gateReactions(BOOM, 'Pátio', candidates, 1);
    expect(rulings).toEqual([
      { who: 'Elara', allow: true, channel: 'heard', why: 'explosão no Pátio é audível no Porão' },
      { who: 'Vulto', allow: false, channel: 'none', why: 'sótão distante' },
    ]);
  });

  it('permite alvo à distância (stake) mesmo sem percepção', async () => {
    const { client, resolver } = mockDeps({
      rulings: [{ who: 'Elara', allow: true, channel: 'stake', why: 'é a afetada' }],
    });
    const agent = new ReactionGateAgent(client as any, resolver as any);
    const rulings = await agent.gateReactions(WHISPER, 'Pátio', [
      { name: 'Elara', where: 'Sótão', isTarget: true, ownsItem: false },
    ], 1);
    expect(rulings[0]).toMatchObject({ who: 'Elara', allow: true, channel: 'stake' });
  });

  it('fail-closed: `allow=true` + `channel=none` vira negação', async () => {
    const { client, resolver } = mockDeps({
      rulings: [{ who: 'Elara', allow: true, channel: 'none', why: 'ops' }],
    });
    const agent = new ReactionGateAgent(client as any, resolver as any);
    const rulings = await agent.gateReactions(BOOM, 'Pátio', [
      { name: 'Elara', where: 'Pátio', isTarget: false, ownsItem: false },
    ], 1);
    expect(rulings).toEqual([{ who: 'Elara', allow: false, channel: 'none', why: 'ops' }]);
  });

  it('`who` fora da lista é descartado; candidato sem ruling é negado', async () => {
    const { client, resolver } = mockDeps({
      rulings: [
        { who: 'Elara', allow: true, channel: 'saw', why: 'viu' },
        { who: 'Fantasma', allow: true, channel: 'saw', why: 'intruso' },
      ],
    });
    const agent = new ReactionGateAgent(client as any, resolver as any);
    const rulings = await agent.gateReactions(BOOM, 'Pátio', [
      { name: 'Elara', where: 'Pátio', isTarget: false, ownsItem: false },
      { name: 'Vulto', where: 'Sótão', isTarget: false, ownsItem: false },
    ], 1);
    expect(rulings.find((r) => r.who === 'Fantasma')).toBeUndefined();
    expect(rulings.find((r) => r.who === 'Vulto')).toMatchObject({ allow: false, channel: 'none' });
  });

  it('fallback determinístico em JSON inválido: mesmo-local + alvo/dono', async () => {
    const { client, resolver } = mockDeps(null);
    const agent = new ReactionGateAgent(client as any, resolver as any);
    const rulings = await agent.gateReactions(BOOM, 'Pátio', [
      { name: 'Elara', where: 'Pátio', isTarget: false, ownsItem: false },
      { name: 'Vulto', where: 'Sótão', isTarget: false, ownsItem: false },
      { name: 'Mira', where: 'Sótão', isTarget: true, ownsItem: false },
    ], 1);
    expect(rulings.find((r) => r.who === 'Elara')).toMatchObject({ allow: true, channel: 'saw' });
    expect(rulings.find((r) => r.who === 'Vulto')).toMatchObject({ allow: false, channel: 'none' });
    expect(rulings.find((r) => r.who === 'Mira')).toMatchObject({ allow: true, channel: 'stake' });
    expect(resolver.resolveJson).toHaveBeenCalledTimes(1);
  });

  it('sem candidatos retorna `[]` sem chamar o resolver', async () => {
    const { client, resolver } = mockDeps({ rulings: [] });
    const agent = new ReactionGateAgent(client as any, resolver as any);
    expect(await agent.gateReactions(BOOM, 'Pátio', [], 1)).toEqual([]);
    expect(resolver.resolveJson).not.toHaveBeenCalled();
  });
});
