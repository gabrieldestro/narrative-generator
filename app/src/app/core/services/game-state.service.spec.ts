import { TestBed } from '@angular/core/testing';
import { GameStateService } from './game-state.service';
import type { GameState } from '../models/game-state.model';

function makeState(): GameState {
  return {
    narrativeStyle: 'Terror de Sobrevivência',
    writingStyle: 'Terror Sombrio',
    worldContext: 'Uma mansão abandonada.',
    turnNumber: 4,
    history: ['Narrativa Inicial: Entrada na mansão.', 'Turno 1: Porta de carvalho range.'],
    characters: [
      { id: '1', name: 'Darian', description: 'Investigador', personality: 'Cauteloso', isPlayer: true },
    ],
    locations: [{ id: 'l1', name: 'Saguão', description: 'Entrada.', connectedTo: [] }],
    lastSceneLocation: 'Saguão',
  };
}

describe('GameStateService.restore', () => {
  let service: GameStateService;

  beforeEach(() => {
    service = TestBed.inject(GameStateService);
  });

  it('deve restaurar sessionId, estado e history, mantendo settings', () => {
    // Estado de debug "sujo" de uma partida anterior
    service.sessionId.set('partida-antiga');
    service.turnDebugHistory.set([
      { turnNumber: 1, npcDecisions: [], diceRolls: [], arbiterResolution: 'ok' },
    ]);
    service.hasProcessedFirstTurn.set(true);
    service.currentTurnResult.set({} as never);

    const state = makeState();
    service.restore('s-9', state);

    expect(service.sessionId()).toBe('s-9');
    expect(service.gameState()).toBe(state);
    expect(service.turnNumber()).toBe(4);
    expect(service.history()).toEqual(state.history);
    expect(service.characters().length).toBe(1);
    expect(service.worldContext()).toBe(state.worldContext);
    expect(service.turnDebugHistory()).toEqual([]);
    expect(service.hasProcessedFirstTurn()).toBe(false);
    expect(service.currentTurnResult()).toBeNull();
    expect(service.error()).toBeNull();
  });

  it('deve aplicar resultado de comando administrativo (applyAdminResult)', () => {
    const initialState = makeState();
    service.setGameState('s-1', initialState);
    service.isLoading.set(true);

    const updatedState: GameState = {
      ...initialState,
      characters: [
        ...initialState.characters,
        { id: '2', name: 'Lobo', description: 'Animal', personality: 'Feroz', isPlayer: false },
      ]
    };

    service.applyAdminResult({
      sessionId: 's-1',
      message: 'Personagem Lobo adicionado',
      updatedState,
    });

    expect(service.isLoading()).toBe(false);
    expect(service.gameState()?.characters.length).toBe(2);
    expect(service.error()).toBeNull();
  });

  it('deve restaurar zerando painéis de debug (npcDecisions/diceRolls/arbiterResolution)', () => {
    service.npcDecisions.set([{ characterName: 'X', action: 'a', reasoning: 'r', success: true }]);
    service.diceRolls.set([{ characterName: 'X', roll: 12 }]);
    service.arbiterResolution.set('Resolução antiga');

    service.restore('s-9', makeState());

    expect(service.npcDecisions()).toEqual([]);
    expect(service.diceRolls()).toEqual([]);
    expect(service.arbiterResolution()).toBeNull();
  });

  it('restore não deve tocar em settings (perfil global)', () => {
    const spy = jasmine.createSpy('settingsSpy').and.returnValue({ memoryWindowSize: 5 });

    // Sem dependência real de SettingsService: apenas garante que o fluxo não referencia settings.
    service.restore('s-9', makeState());

    expect(spy).not.toHaveBeenCalled();
    const restored = service.gameState() as GameState & Record<string, unknown>;
    expect(restored['settings']).toBeUndefined();
  });
});

describe('GameStateService.setTurnResult — stepTrace', () => {
  let service: GameStateService;

  beforeEach(() => {
    service = TestBed.inject(GameStateService);
  });

  function makeTrace() {
    // 1 turno = 1 ação + reações: trace de bloco único.
    return [
      {
        step: 1, actor: 'Darian', actorWhere: 'Pátio', spotlight: 'Darian',
        queue: [
          { who: 'Darian', where: 'Pátio', status: 'done' as const },
          { who: 'Elara', where: 'Porão', status: 'done' as const },
          { who: 'Vulto', where: 'Sótão', status: 'denied' as const },
        ],
        gate: {
          allowed: [{ who: 'Elara', channel: 'heard' as const }],
          denied: [{ who: 'Vulto', why: 'sótão distante' }],
        },
      },
    ];
  }

  it('armazena o trace do turno (ator + reatores)', () => {
    const state = {
      narrativeStyle: 'F', writingStyle: 'E', worldContext: 'P.',
      turnNumber: 3, history: [], characters: [],
    };
    service.setTurnResult({
      sessionId: 's-1', narrative: 'N.', logicalResolution: 'L.',
      updatedState: state, stepTrace: makeTrace(),
      nextActor: 'Elara', awaitingPlayer: false,
    });
    expect(service.hasTrace()).toBe(true);
    expect(service.selectedStep()?.actor).toBe('Darian');
    expect(service.turnQueue().map(q => q.who)).toEqual(['Darian', 'Elara', 'Vulto']);
  });

  it('nextInOrder é o primeiro após o foco', () => {
    const state = {
      narrativeStyle: 'F', writingStyle: 'E', worldContext: 'P.',
      turnNumber: 3, history: [], characters: [],
    };
    service.setTurnResult({
      sessionId: 's-1', narrative: 'N.', logicalResolution: 'L.',
      updatedState: state, stepTrace: makeTrace(),
      nextActor: 'Elara', awaitingPlayer: false,
    });
    expect(service.nextInOrder()).toBe('Elara');
    // clamp fora da faixa
    service.selectStep(99);
    expect(service.selectedStepIndex()).toBe(0);
  });

  it('sem trace: fila vazia, sem próximo, ledger vazio', () => {
    expect(service.hasTrace()).toBe(false);
    expect(service.turnQueue()).toEqual([]);
    expect(service.nextInOrder()).toBeNull();
    expect(service.eventsLedger()).toEqual([]);
  });

  it('fases: begin → reaction → arbiter → narration atualizam parciais ao vivo', () => {
    const state = {
      narrativeStyle: 'F', writingStyle: 'E', worldContext: 'P.',
      turnNumber: 3, history: [], characters: [],
    };
    service.setGameState('s-1', state);

    service.beginPhasedTurn({
      sessionId: 's-1', turnId: 't-1', turnNumber: 3,
      actor: 'Zé', actionText: 'Zé avança.', diceRoll: { characterName: 'Zé', roll: 15 },
      allowed: [{ who: 'João', channel: 'saw' }], denied: [], reactionsPending: 1,
    });
    expect(service.activeTurnId()).toBe('t-1');
    expect(service.turnActor()).toBe('Zé');
    expect(service.turnPhase()).toBe('awaiting_reactions');
    expect(service.diceRolls().length).toBe(1);
    expect(service.pendingMessages().length).toBe(1);

    service.applyReaction({
      sessionId: 's-1', turnId: 't-1', who: 'João', action: 'João acena.',
      ignored: false, channel: 'saw', reactionsPending: 0, reactionsDone: true,
    }, 2, 4);
    expect(service.turnPhase()).toBe('awaiting_arbiter');
    expect(service.pendingMessages().length).toBe(2);

    service.applyArbiter({
      sessionId: 's-1', turnId: 't-1', outcome: 'success', reason: 'ok',
      violent: false, resolutionLine: 'Zé tentou avançar -> Sucesso porque ok',
    }, 3, 4);
    expect(service.arbiterResolution()).toContain('Sucesso');

    service.applyNarration('Zé cruza o pátio.', 4, 4);
    expect(service.pendingMessages().length).toBe(4);

    service.setTurnResult({
      sessionId: 's-2', narrative: 'Final.', logicalResolution: 'L.',
      updatedState: state, npcDecisions: [], diceRolls: [],
      nextActor: 'João', awaitingPlayer: false,
    });
    expect(service.activeTurnId()).toBeNull();
    expect(service.turnProgress()).toBeNull();
    expect(service.pendingMessages()).toEqual([]);
  });

  it('eventsLedger expõe os events do estado (separado da prosa)', () => {
    const state = {
      narrativeStyle: 'F', writingStyle: 'E', worldContext: 'P.',
      turnNumber: 3, history: ['Turno 2: prosa...'], characters: [],
      events: [{ seq: 1, turn: 2, who: 'Darian', did: 'escalou muro', outcome: 'failure' as const, where: 'Pátio' }],
    };
    service.setGameState('s-1', state);
    expect(service.eventsLedger().length).toBe(1);
    expect(service.eventsLedger()[0]!.who).toBe('Darian');
  });
});