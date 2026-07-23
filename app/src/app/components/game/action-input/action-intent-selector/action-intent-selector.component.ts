import { Component, Output, EventEmitter } from '@angular/core';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import type { ActionIntent } from '../../../../core/models/api-payloads.model';

interface ActionIntentOption {
  icon: string;
  label: string;
  value: ActionIntent;
}

const ACTION_INTENTS: ActionIntentOption[] = [
  { icon: '🔍', label: 'Curioso', value: 'curious' },
  { icon: '😠', label: 'Agressivo', value: 'aggressive' },
  { icon: '😟', label: 'Cauteloso', value: 'cautious' },
  { icon: '😊', label: 'Amigável', value: 'friendly' },
  { icon: '💀', label: 'Intimidador', value: 'intimidating' },
  { icon: '😰', label: 'Desesperado', value: 'desperate' },
  { icon: '😐', label: 'Neutro', value: 'neutral' },
];

@Component({
  selector: 'ng-action-intent-selector',
  standalone: true,
  imports: [MatSelectModule, MatFormFieldModule],
  template: `
    <mat-form-field appearance="fill" subscriptSizing="dynamic">
      <mat-label>Intenção</mat-label>
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
export class ActionIntentSelectorComponent {
  readonly options = ACTION_INTENTS;
  value: ActionIntent = 'neutral';

  @Output() intentChange = new EventEmitter<ActionIntent>();

  onChange(val: ActionIntent): void {
    this.value = val;
    this.intentChange.emit(val);
  }
}
