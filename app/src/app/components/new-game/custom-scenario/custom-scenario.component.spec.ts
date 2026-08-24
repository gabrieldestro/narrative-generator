import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { CustomScenarioComponent, CustomScenarioData } from './custom-scenario.component';
import type { WorldTemplate } from '../../../core/models/world-template.model';

describe('CustomScenarioComponent', () => {
  let fixture: ComponentFixture<CustomScenarioComponent>;
  let component: CustomScenarioComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CustomScenarioComponent],
      providers: [provideNoopAnimations(), provideHttpClient()],
    });
    fixture = TestBed.createComponent(CustomScenarioComponent);
    component = fixture.componentInstance;
  });

  it('emite CustomScenarioData completo (com personagens, lugares e conceitos)', () => {
    component.narrativeStyle = 'Fantasia';
    component.writingStyle = 'Épico';
    component.worldContext = 'Mundo de teste';
    component.characters = [
      { name: 'Aria', description: 'Ladina', personality: 'Astuta', isPlayer: true, inventory: ['Adaga'] },
    ];
    component.locations = [{ id: 'l1', name: 'Taverna', description: '', connectedTo: [] }];
    component.concepts = [{ id: 'c1', type: 'faction', name: 'Ladinos', description: '' }];

    let emitted: CustomScenarioData | undefined;
    component.createCustom.subscribe((d) => (emitted = d));

    component.onSubmit();

    expect(emitted).toBeDefined();
    expect(emitted!.narrativeStyle).toBe('Fantasia');
    expect(emitted!.characters.length).toBe(1);
    expect(emitted!.locations.length).toBe(1);
    expect(emitted!.concepts.length).toBe(1);
  });

  it('bloqueia submit sem worldContext', () => {
    component.worldContext = '';
    let emitted = false;
    component.createCustom.subscribe(() => (emitted = true));
    component.onSubmit();
    expect(emitted).toBe(false);
  });

  it('pré-preenche a partir do baseTemplate via deep copy', () => {
    const base: WorldTemplate = {
      name: 'Base',
      description: 'd',
      narrativeStyle: 'Cyberpunk',
      writingStyle: 'Noir',
      worldContext: 'Cidade neon',
      characters: [{ name: 'V', description: 'Merc', personality: 'Fria', inventory: ['Arma'] }],
      locations: [],
      concepts: [],
    };
    component.baseTemplate = base;
    fixture.detectChanges();

    expect(component.narrativeStyle).toBe('Cyberpunk');
    expect(component.worldContext).toBe('Cidade neon');
    expect(component.characters.length).toBe(1);
    // deep copy: mutar o array local não altera o template original
    component.characters.push({ name: 'X', description: '', personality: '' });
    expect(base.characters.length).toBe(1);
  });

  it('reflete e atualiza os lugares no datalist do local inicial do personagem', () => {
    component.worldContext = 'x';
    component.characters = [{ name: 'Aria', description: '', personality: '', isPlayer: true, inventory: [] }];
    component.locations = [{ id: 'l1', name: 'Taverna', description: '', connectedTo: [] }];
    fixture.detectChanges();

    let options = Array.from(fixture.nativeElement.querySelectorAll('datalist option')) as HTMLOptionElement[];
    expect(options.some((o) => o.value === 'Taverna')).toBe(true);

    // alterar o nome do lugar deve atualizar o dropdown imediatamente
    component.locations[0].name = 'Castelo';
    fixture.detectChanges();
    options = Array.from(fixture.nativeElement.querySelectorAll('datalist option')) as HTMLOptionElement[];
    expect(options.some((o) => o.value === 'Castelo')).toBe(true);
    expect(options.some((o) => o.value === 'Taverna')).toBe(false);
  });
});
