import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError, NEVER } from 'rxjs';
import { EnrichButtonComponent } from './enrich-button.component';
import { EnrichService } from '../../../../core/services/enrich.service';

describe('EnrichButtonComponent', () => {
  let fixture: ComponentFixture<EnrichButtonComponent>;
  let component: EnrichButtonComponent;
  const enrichSpy = jasmine.createSpyObj<EnrichService>('EnrichService', ['enrichField']);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EnrichButtonComponent],
      providers: [
        { provide: EnrichService, useValue: enrichSpy },
        provideNoopAnimations(),
      ],
    });
    fixture = TestBed.createComponent(EnrichButtonComponent);
    component = fixture.componentInstance;
    (enrichSpy.enrichField as jasmine.Spy).calls.reset();
  });

  it('emite o texto enriquecido ao clicar', () => {
    enrichSpy.enrichField.and.returnValue(of({ enriched: 'texto rico' }));
    component.field = 'Descrição';
    component.value = 'texto';
    component.getContext = () => null;
    const emitted: string[] = [];
    component.enriched.subscribe((v) => emitted.push(v));

    component.onEnrich();

    expect(enrichSpy.enrichField).toHaveBeenCalled();
    expect(emitted).toContain('texto rico');
    expect(component.loading()).toBe(false);
  });

  it('trata erro do serviço sem quebrar o fluxo', () => {
    enrichSpy.enrichField.and.returnValue(throwError(() => new Error('x')));
    component.field = 'x';
    component.value = 'v';
    component.getContext = () => null;

    component.onEnrich();

    expect(component.loading()).toBe(false);
  });

  it('ignora cliques enquanto carrega', () => {
    enrichSpy.enrichField.and.returnValue(NEVER);
    component.field = 'x';
    component.value = 'v';
    component.getContext = () => null;
    component.onEnrich();
    component.onEnrich(); // segundo clique ignorado (loading true)
    expect(enrichSpy.enrichField).toHaveBeenCalledTimes(1);
  });
});
