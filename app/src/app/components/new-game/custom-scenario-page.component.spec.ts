import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomScenarioPageComponent } from './custom-scenario-page.component';
import { ApiService } from '../../core/services/api.service';
import { LoggingService } from '../../core/services/logging.service';
import type { CustomScenarioData } from './custom-scenario/custom-scenario.component';
import type { CreateGameCustomPayload } from '../../core/models/api-payloads.model';

describe('CustomScenarioPageComponent', () => {
  let fixture: ComponentFixture<CustomScenarioPageComponent>;
  let component: CustomScenarioPageComponent;
  const apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['createGame']);
  const routerSpy = jasmine.createSpyObj<Router>('Router', ['navigate', 'getCurrentNavigation']);
  const snackSpy = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
  const logSpy = jasmine.createSpyObj<LoggingService>('LoggingService', ['info', 'error']);

  const data: CustomScenarioData = {
    narrativeStyle: 'Fantasia',
    writingStyle: 'Épico',
    worldContext: 'Mundo',
    characters: [{ name: 'Aria', description: 'd', personality: 'p', isPlayer: true }],
    locations: [],
    concepts: [],
  };

  beforeEach(() => {
    apiSpy.createGame.calls.reset();
    routerSpy.navigate.calls.reset();
    TestBed.configureTestingModule({
      imports: [CustomScenarioPageComponent],
      providers: [
        { provide: ApiService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
        { provide: MatSnackBar, useValue: snackSpy },
        { provide: LoggingService, useValue: logSpy },
      ],
    });
    fixture = TestBed.createComponent(CustomScenarioPageComponent);
    component = fixture.componentInstance;
  });

  it('envia o mundo estruturado para createGame', () => {
    apiSpy.createGame.and.returnValue(of({ sessionId: 'abc', state: {} as any }));

    component.onCreateCustom(data);

    expect(apiSpy.createGame).toHaveBeenCalledTimes(1);
    const payload = apiSpy.createGame.calls.mostRecent().args[0] as CreateGameCustomPayload;
    expect(payload.mode).toBe('custom');
    expect(payload.world).toBeDefined();
    expect(payload.world!.narrativeStyle).toBe('Fantasia');
    expect(payload.world!.characters.length).toBe(1);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/game', 'abc']);
  });

  it('mostra erro se createGame falhar', () => {
    apiSpy.createGame.and.returnValue(throwError(() => new Error('boom')));

    component.onCreateCustom(data);

    expect(component.isCreating()).toBe(false);
    expect(snackSpy.open).toHaveBeenCalled();
  });
});
