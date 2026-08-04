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
    .inventory-panel { padding: 0.75rem 1rem; }
    .inventory-panel__empty { color: var(--text-muted); font-size: 0.875rem; font-style: italic; }
    .inventory-panel__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem; }
    .inventory-panel__item {
      padding: 0.4rem 0.6rem;
      font-size: 0.85rem;
      border-radius: 8px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-family: 'Inter', sans-serif;
    }
  `]
})
export class InventoryPanelComponent {
  @Input() items: string[] = [];
}
