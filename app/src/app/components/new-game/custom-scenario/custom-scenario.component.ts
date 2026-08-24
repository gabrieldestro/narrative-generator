import { Component, Input, Output, EventEmitter, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { WorldTemplate, CharacterTemplate } from '../../../core/models/world-template.model';
import type { Location } from '../../../core/models/location.model';
import type { WorldConcept } from '../../../core/models/world-concept.model';
import { EnrichButtonComponent } from './enrich-button/enrich-button.component';
import { CharactersEditorComponent } from './characters-editor/characters-editor.component';
import { PlacesEditorComponent } from './places-editor/places-editor.component';
import { ConceptsEditorComponent } from './concepts-editor/concepts-editor.component';

export interface CustomScenarioData {
  narrativeStyle: string;
  writingStyle: string;
  worldContext: string;
  characters: CharacterTemplate[];
  locations: Location[];
  concepts: WorldConcept[];
}

@Component({
  selector: 'ng-custom-scenario',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    EnrichButtonComponent,
    CharactersEditorComponent,
    PlacesEditorComponent,
    ConceptsEditorComponent,
  ],
  templateUrl: './custom-scenario.component.html',
  styleUrl: './custom-scenario.component.scss',
})
export class CustomScenarioComponent {
  @Input() baseTemplate: WorldTemplate | null = null;
  @Output() createCustom = new EventEmitter<CustomScenarioData>();
  @Output() cancelCustom = new EventEmitter<void>();

  narrativeStyle = '';
  writingStyle = '';
  worldContext = '';

  characters: CharacterTemplate[] = [];
  locations: Location[] = [];
  concepts: WorldConcept[] = [];

  submitted = false;

  get isEditing(): boolean {
    return !!this.baseTemplate;
  }

  get previewTitle(): string {
    return this.narrativeStyle || 'Seu Mundo';
  }

  get previewStyle(): string {
    return this.writingStyle || 'Estilo livre';
  }

  get previewContext(): string {
    if (!this.worldContext) return 'O contexto do seu mundo aparecerá aqui conforme você escreve...';
    return this.worldContext.length > 280
      ? this.worldContext.slice(0, 280) + '…'
      : this.worldContext;
  }

  // Contexto usado pelos botões "Enrich" (sempre reflete o estado atual do formulário).
  getContext = (): WorldTemplate | null => this.buildWorldTemplate();

  constructor() {
    effect(() => {
      const tpl = this.baseTemplate;
      if (tpl) {
        this.narrativeStyle = tpl.narrativeStyle ?? '';
        this.writingStyle = tpl.writingStyle ?? '';
        this.worldContext = tpl.worldContext ?? '';
        this.characters = structuredClone(tpl.characters ?? []) as CharacterTemplate[];
        this.locations = structuredClone(tpl.locations ?? []) as Location[];
        this.concepts = structuredClone(tpl.concepts ?? []) as WorldConcept[];
        this.submitted = false;
      }
    });
  }

  onSubmit(): void {
    this.submitted = true;
    if (!this.worldContext.trim()) return;

    this.createCustom.emit({
      narrativeStyle: this.narrativeStyle,
      writingStyle: this.writingStyle,
      worldContext: this.worldContext,
      characters: this.characters,
      locations: this.locations,
      concepts: this.concepts,
    });
  }

  clearBase(): void {
    this.cancelCustom.emit();
  }

  buildWorldTemplate(): WorldTemplate {
    return {
      name: this.narrativeStyle || 'Cenário Customizado',
      description: this.worldContext.slice(0, 120),
      narrativeStyle: this.narrativeStyle,
      writingStyle: this.writingStyle,
      worldContext: this.worldContext,
      characters: this.characters,
      locations: this.locations,
      concepts: this.concepts,
    };
  }
}
