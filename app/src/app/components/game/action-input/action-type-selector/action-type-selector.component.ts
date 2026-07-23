import { Component, Output, EventEmitter } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import type { ActionType } from '../../../../core/models/api-payloads.model';

interface ActionTypeOption {
  icon: string;
  label: string;
  value: ActionType;
}

const ACTION_TYPES: ActionTypeOption[] = [
  { icon: '👁', label: 'Observar', value: 'observe' },
  { icon: '💬', label: 'Falar', value: 'speak' },
  { icon: '⚔', label: 'Atacar', value: 'attack' },
  { icon: '🐾', label: 'Furtividade', value: 'sneak' },
  { icon: '🎒', label: 'Usar Item', value: 'use_item' },
  { icon: '🤝', label: 'Interagir', value: 'interact' },
  { icon: '🏃', label: 'Fugir', value: 'flee' },
  { icon: '✏️', label: 'Livre', value: 'free' },
];

@Component({
  selector: 'ng-action-type-selector',
  standalone: true,
  imports: [MatSelectModule, MatFormFieldModule],
  template: `
    <mat-form-field appearance="fill" subscriptSizing="dynamic">
      <mat-label>Ação</mat-label>
      <mat-select [value]="value" (valueChange)="onChange($event)">
        @for (opt of options; track opt.value) {
          <mat-option [value]="opt.value">
            {{ opt.icon }} {{ opt.label }}
          </mat-option>
        }
      </mat-select>
    </mat-form-field>
  `
})
export class ActionTypeSelectorComponent {
  readonly options = ACTION_TYPES;
  value: ActionType = 'free';

  @Output() typeChange = new EventEmitter<ActionType>();

  onChange(val: ActionType): void {
    this.value = val;
    this.typeChange.emit(val);
  }
}
