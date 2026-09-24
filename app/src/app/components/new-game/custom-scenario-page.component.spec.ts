import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomScenarioPageComponent } from './custom-scenario-page.component';
import { ApiService } from '../../core/services/api.service';
import { LoggingService } from '../../core/services/logging.service';
import type { CustomScenarioData } from './custom-scenario/custom-scenario.component';
import type { WorldTemplate } from '../../core/models/world-template.model';

describe('CustomScenarioPageComponent', () => {
  let fixture: ComponentFixture<CustomScenarioPageComponent>;
  let component: CustomScenarioPageComponent;
  const apiSpy = jasmine.createSpyObj<ApiService>('ApiService', ['saveWorld']);
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
    apiSpy.saveWorld.calls.reset();
    routerSpy.navigate.calls.reset();
    snackSpy.open.calls.reset();
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

  it('salva o mundo como template e volta para /new-game (nunca /game)', () => {
    apiSpy.saveWorld.and.returnValue(of({ id: 'custom-fantasia', template: {} as any }));

    component.onCreateCustom(data);

    expect(apiSpy.saveWorld).toHaveBeenCalledTimes(1);
    const world = apiSpy.saveWorld.calls.mostRecent().args[0] as WorldTemplate;
    expect(world.narrativeStyle).toBe('Fantasia');
    expect(world.characters.length).toBe(1);
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/new-game']);
    expect(routerSpy.navigate).not.toHaveBeenCalledWith(jasmine.arrayContaining([jasmine.stringMatching('/game')]) as any);
    expect(snackSpy.open).toHaveBeenCalledWith('Template salvo!', 'Fechar', jasmine.anything() as any);
  });

  it('mostra erro se saveWorld falhar', () => {
    apiSpy.saveWorld.and.returnValue(throwError(() => new Error('boom')));

    component.onCreateCustom(data);

    expect(component.isCreating()).toBe(false);
    expect(snackSpy.open).toHaveBeenCalled();
  });
});
