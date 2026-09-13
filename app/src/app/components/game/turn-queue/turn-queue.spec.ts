import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TurnQueueComponent } from './turn-queue.component';
import { GameStateService } from '../../../core/services/game-state.service';
import type { TurnResponse } from '../../../core/models/api-payloads.model';
import type { GameState } from '../../../core/models/game-state.model';

function makeState(): GameState {
  return {
    narrativeStyle: 'Fantasia',
    writingStyle: 'Épico',
    worldContext: 'Pátio.',
    turnNumber: 2,
    history: [],
    characters: [
      { id: '1', name: 'Darian', description: 'G', personality: 'B', isPlayer: true, currentLocation: 'Pátio' },
      { id: '2', name: 'Elara', description: 'E', personality: 'S', isPlayer: false, currentLocation: 'Porão' },
    ],
  };
}

function makeTurnResponse(): TurnResponse {
  return {
    sessionId: 's-1',
    narrative: 'Micro-narração.',
    logicalResolution: 'Darian tentou X -> Sucesso porque ...',
    updatedState: { ...makeState(), turnNumber: 3 },
    npcDecisions: [],
    diceRolls: [],
    npcOrder: ['Darian', 'Elara'],
    microTrace: [
      {
        micro: 1,
        actor: 'Darian',
        actorWhere: 'Pátio',
        queue: [
          { who: 'Darian', where: 'Pátio', status: 'done' },
          { who: 'Elara', where: 'Porão', status: 'done' },
        ],
        spotlight: 'Darian',
        gate: { allowed: [{ who: 'Elara', channel: 'heard' }], denied: [] },
      },
      {
        micro: 2,
        actor: 'Elara',
        actorWhere: 'Porão',
        queue: [
          { who: 'Elara', where: 'Porão', status: 'done' },
          { who: 'Vulto', where: 'Sótão', status: 'denied' },
        ],
        spotlight: 'Elara',
        gate: { allowed: [], denied: [{ who: 'Vulto', why: 'sótão distante' }] },
      },
    ],
  };
}

// Doc 27, Fase 5 (§7.3/§9) — fila de turno na tela.
describe('TurnQueueComponent', () => {
  let fixture: ComponentFixture<TurnQueueComponent>;
  let service: GameStateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TurnQueueComponent],
    }).compileComponents();
    service = TestBed.inject(GameStateService);
    service.setGameState('s-1', makeState());
    fixture = TestBed.createComponent(TurnQueueComponent);
    fixture.detectChanges();
  });

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  it('renderiza chips na ordem do bloco selecionado (default = último)', () => {
    service.setTurnResult(makeTurnResponse());
    fixture.detectChanges();
    const body = text();
    expect(body).toContain('Elara');
    expect(body).toContain('Vulto');
    expect(body).toContain('não percebeu');
  });

  it('mostra "Próximo na ordem: X" (primeiro após o foco)', () => {
    service.setTurnResult(makeTurnResponse());
    service.selectMicro(0);
    fixture.detectChanges();
    expect(text()).toContain('Próximo na ordem: Elara');
  });

  it('negado aparece com o `why` (tooltip) e sem ação', () => {
    service.setTurnResult(makeTurnResponse());
    service.selectMicro(1);
    fixture.detectChanges();
    const denied: HTMLElement = fixture.nativeElement.querySelector('.turn-queue__chip--denied');
    expect(denied).withContext('chip denied renderizado').not.toBeNull();
    expect(denied.getAttribute('title')).toContain('sótão distante');
    expect(denied.textContent).not.toContain('ouviu');
  });

  it('isLoading mostra esqueleto', () => {
    service.isLoading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.turn-queue__skeleton')).not.toBeNull();
  });

  it('sem trace mostra roster neutro', () => {
    fixture.detectChanges();
    const body = text();
    expect(body).toContain('Darian');
    expect(body).toContain('Elara');
    expect(body).not.toContain('Próximo na ordem');
  });

  it('seletor de micro troca o bloco (strip com 2 micros)', () => {
    service.setTurnResult(makeTurnResponse());
    fixture.detectChanges();
    const buttons: NodeListOf<HTMLButtonElement> =
      fixture.nativeElement.querySelectorAll('.turn-queue__micro-btn');
    expect(buttons.length).toBe(2);
    buttons[0]!.click();
    fixture.detectChanges();
    expect(service.selectedMicro()).toBe(0);
    expect(text()).toContain('(ouviu)');
  });
});
