import { Component, Input, Output, EventEmitter } from '@angular/core';
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
  templateUrl: './action-type-selector.component.html',
})
export class ActionTypeSelectorComponent {
  @Input() disabled = false;
  readonly options = ACTION_TYPES;
  value: ActionType = 'free';

  @Output() typeChange = new EventEmitter<ActionType>();

  onChange(val: ActionType): void {
    this.value = val;
    this.typeChange.emit(val);
  }
}
