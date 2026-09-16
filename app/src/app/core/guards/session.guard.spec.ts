import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SessionGuard } from './session.guard';
import { ApiService } from '../services/api.service';
import { GameStateService } from '../services/game-state.service';
import type { GameState } from '../models/game-state.model';
import type { TurnResponse } from '../models/api-payloads.model';

function makeState(): GameState {
  return {
    narrativeStyle: 'Fantasia',
    writingStyle: 'Épico',
    worldContext: 'Pátio.',
    turnNumber: 3,
    history: ['Narrativa Inicial: Entrada no pátio.', 'Turno 2: prosa...'],
    characters: [
      { id: '1', name: 'Darian', description: 'G', personality: 'B', isPlayer: true, currentLocation: 'Pátio' },
    ],
  };
}

function makeTurnResult(sessionId: string): TurnResponse {
  return {
    sessionId,
    narrative: 'Micro-narração.',
    logicalResolution: 'Darian tentou X -> Sucesso porque ...',
    updatedState: makeState(),
    npcDecisions: [{ characterName: 'Elara', action: 'a', reasoning: 'r', success: true }],
    diceRolls: [{ characterName: 'Darian', roll: 11 }],
    microTrace: [
      {
        micro: 1,
        actor: 'Darian',
        actorWhere: 'Pátio',
        queue: [{ who: 'Darian', where: 'Pátio', status: 'done' }],
        spotlight: 'Darian',
        gate: { allowed: [], denied: [] },
      },
    ],
  };
}

function routeWith(sessionId: string): ActivatedRouteSnapshot {
  return { paramMap: convertToParamMap({ sessionId }) } as unknown as ActivatedRouteSnapshot;
}

// Regressão: o navigate pós-turno (para o novo checkpoint) não pode
// refetchar e zerar o contexto transitório (microTrace/debug) — só a
// narrativa central (history, persistido) sobreviveria.
describe('SessionGuard', () => {
  let guard: SessionGuard;
  let gameState: GameStateService;
  let api: { getGameState: jasmine.Spy };
  let router: { parseUrl: jasmine.Spy };

  beforeEach(() => {
    api = { getGameState: jasmine.createSpy('getGameState') };
    router = { parseUrl: jasmine.createSpy('parseUrl') };
    TestBed.configureTestingModule({
      providers: [
        SessionGuard,
        { provide: ApiService, useValue: api },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(SessionGuard);
    gameState = TestBed.inject(GameStateService);
  });

  it('não refetcha quando a sessão já está carregada (preserva turno)', (done) => {
    gameState.setTurnResult(makeTurnResult('s-2'));
    expect(gameState.hasTrace()).toBeTrue();

    guard.canActivate(routeWith('s-2')).subscribe((result) => {
      expect(result).toBeTrue();
      expect(api.getGameState).not.toHaveBeenCalled();
      expect(gameState.hasTrace()).toBeTrue();
      expect(gameState.turnDebugHistory().length).toBe(1);
      expect(gameState.npcDecisions().length).toBe(1);
      done();
    });
  });

  it('fetcha e hidrata quando a sessão é outra (deep link / novo jogo)', (done) => {
    gameState.setTurnResult(makeTurnResult('s-1'));
    api.getGameState.and.returnValue(of({ sessionId: 's-9', state: makeState() }));

    guard.canActivate(routeWith('s-9')).subscribe((result) => {
      expect(result).toBeTrue();
      expect(api.getGameState).toHaveBeenCalledWith('s-9');
      expect(gameState.sessionId()).toBe('s-9');
      done();
    });
  });

  it('redireciona para /new-game quando o GET falha', (done) => {
    const urlTree = {} as never;
    router.parseUrl.and.returnValue(urlTree);
    api.getGameState.and.returnValue(throwError(() => new Error('404')));

    guard.canActivate(routeWith('missing')).subscribe((result) => {
      expect(result).toBe(urlTree as never);
      expect(router.parseUrl).toHaveBeenCalledWith('/new-game');
      done();
    });
  });
});
