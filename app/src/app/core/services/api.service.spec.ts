import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import type { SavedGameSummary, SessionBundle } from '../models/session-save.model';
import type { GameState } from '../models/game-state.model';

function makeGameState(): GameState {
  return {
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico / Poético',
    worldContext: 'Uma masmorra sombria.',
    turnNumber: 3,
    history: ['Narrativa Inicial: ...', 'Turno 1: ...'],
    characters: [
      { id: '1', name: 'Aric', description: 'Herói', personality: 'Bravo', isPlayer: true },
    ],
    locations: [],
  };
}

function makeBundle(id: string): SessionBundle {
  return {
    schemaVersion: 1,
    id,
    mode: 'template',
    title: 'A Masmorra Esquecida',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    narrativeStyle: 'Fantasia Medieval',
    writingStyle: 'Épico / Poético',
    turnNumber: 3,
    playerCharacterName: 'Aric',
    lastNarrative: 'Turno 3: O herói avança.',
    state: makeGameState(),
  };
}

describe('ApiService (saves)', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listSaves deve fazer GET /saves e devolver resumos sem state/schemaVersion', () => {
    let result: SavedGameSummary[] | undefined;
    service.listSaves().subscribe(r => (result = r));

    const req = httpMock.expectOne('http://localhost:3000/api/saves');
    expect(req.request.method).toBe('GET');
    req.flush([makeBundle('s-1'), makeBundle('s-2')]);

    expect(result?.length).toBe(2);
    expect(result?.[0]?.id).toBe('s-1');
    expect(result?.[0]?.turnNumber).toBe(3);
    const first = result![0] as SavedGameSummary & Record<string, unknown>;
    expect(first['state']).toBeUndefined();
    expect(first['schemaVersion']).toBeUndefined();
  });

  it('loadSave deve fazer GET /saves/:id e devolver o SessionBundle', () => {
    let result: SessionBundle | undefined;
    service.loadSave('s-1').subscribe(r => (result = r));

    const req = httpMock.expectOne('http://localhost:3000/api/saves/s-1');
    expect(req.request.method).toBe('GET');
    req.flush(makeBundle('s-1'));

    expect(result?.id).toBe('s-1');
    expect(result?.state.turnNumber).toBe(3);
    expect(result?.state.history.length).toBe(2);
  });

  it('deleteSave deve fazer DELETE /saves/:id', () => {
    let completed = false;
    service.deleteSave('s-1').subscribe(() => (completed = true));

    const req = httpMock.expectOne('http://localhost:3000/api/saves/s-1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(completed).toBe(true);
  });
});