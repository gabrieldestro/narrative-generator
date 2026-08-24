import { Component, Input, Output, EventEmitter } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import type { WorldConcept } from '../../../../core/models/world-concept.model';
import type { ConceptType } from '../../../../core/models/world-concept.model';
import type { WorldTemplate } from '../../../../core/models/world-template.model';
import { EnrichButtonComponent } from '../enrich-button/enrich-button.component';

@Component({
  selector: 'ng-concepts-editor',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatDividerModule,
    EnrichButtonComponent,
  ],
  templateUrl: './concepts-editor.component.html',
})
export class ConceptsEditorComponent {
  @Input() concepts: WorldConcept[] = [];
  @Input() getContext: () => WorldTemplate | null = () => null;
  @Output() conceptsChange = new EventEmitter<WorldConcept[]>();

  readonly types: ConceptType[] = ['item', 'faction', 'state', 'region', 'place', 'custom'];

  addConcept(): void {
    this.concepts.push({
      id: this.genId(),
      type: 'item',
      name: '',
      description: '',
    });
    this.emit();
  }

  removeConcept(index: number): void {
    this.concepts.splice(index, 1);
    this.emit();
  }

  private genId(): string {
    return `con-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  private emit(): void {
    this.conceptsChange.emit(this.concepts);
  }
}
