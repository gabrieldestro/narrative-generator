import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { CharactersEditorComponent } from './characters-editor.component';

describe('CharactersEditorComponent', () => {
  let fixture: ComponentFixture<CharactersEditorComponent>;
  let component: CharactersEditorComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CharactersEditorComponent],
      providers: [provideNoopAnimations(), provideHttpClient()],
    });
    fixture = TestBed.createComponent(CharactersEditorComponent);
    component = fixture.componentInstance;
  });

  it('define o primeiro personagem como jogador', () => {
    component.addCharacter();
    expect(component.characters[0].isPlayer).toBe(true);
  });

  it('impede dois personagens como jogador (desmarca os demais)', () => {
    component.addCharacter();
    component.addCharacter();
    component.addCharacter();
    component.onPlayerChange(component.characters[1], true);
    expect(component.characters[1].isPlayer).toBe(true);
    expect(component.characters[0].isPlayer).toBe(false);
    expect(component.characters[2].isPlayer).toBe(false);
    // ao desmarcar, não força outro personagem
    component.onPlayerChange(component.characters[1], false);
    expect(component.characters.every((c) => !c.isPlayer)).toBe(true);
  });

  it('esconde o Objetivo de longo prazo para o jogador', () => {
    component.addCharacter();
    component.characters[0].isPlayer = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Objetivo de longo prazo');

    component.characters[0].isPlayer = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Objetivo de longo prazo');
  });
});
