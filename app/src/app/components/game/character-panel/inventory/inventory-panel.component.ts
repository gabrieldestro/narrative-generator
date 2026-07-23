import { Component, Input } from '@angular/core';
import type { Character } from '../../../../core/models/character.model';

@Component({
  selector: 'ng-inventory-panel',
  standalone: true,
  template: `
    <div class="inventory-panel">
      <h4 class="section-title">INVENTÁRIO</h4>
      @if (items.length === 0) {
        <p class="inventory-panel__empty">Sem itens</p>
      } @else {
        <ul class="inventory-panel__list">
          @for (item of items; track item) {
            <li class="inventory-panel__item">{{ item }}</li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .inventory-panel { padding: 0.75rem; }
    .inventory-panel__empty { color: #666; font-size: 0.875rem; }
    .inventory-panel__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
    .inventory-panel__item { padding: 0.25rem 0.5rem; font-size: 0.875rem; border-radius: 4px; background: #2a2a2a; }
  `]
})
export class InventoryPanelComponent {
  @Input() items: string[] = [];
}
