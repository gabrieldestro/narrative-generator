import { Component, Input } from '@angular/core';
import type { DiceRoll } from '../../../../core/models/turn-result.model';

@Component({
  selector: 'ng-dice-rolls',
  standalone: true,
  template: `
    <div class="dice-rolls">
      <h4 class="section-title">ROLAGENS DE DADOS</h4>
      @if (rolls.length === 0) {
        <p class="dice-rolls__empty">Aguardando...</p>
      } @else {
        @for (roll of rolls; track $index) {
          <div class="dice-rolls__entry">
            <div class="dice-rolls__header">
              <span class="dice-rolls__name">{{ roll.characterName }}</span>
              <span class="dice-rolls__value" [style.color]="rollColor(roll.roll)">D20 → {{ roll.roll }}</span>
            </div>
            <div class="dice-rolls__bar">
              <div class="dice-rolls__bar-fill" [style.width.%]="(roll.roll / 20) * 100" [style.background]="rollColor(roll.roll)"></div>
            </div>
            <span class="dice-rolls__label">{{ rollLabel(roll.roll) }}</span>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .dice-rolls { padding: 0.75rem; }
    .dice-rolls__empty { color: #666; font-size: 0.875rem; text-align: center; }
    .dice-rolls__entry { margin-bottom: 0.75rem; }
    .dice-rolls__header { display: flex; justify-content: space-between; margin-bottom: 0.25rem; }
    .dice-rolls__name { font-weight: 600; font-size: 0.875rem; }
    .dice-rolls__value { font-family: 'JetBrains Mono', monospace; font-weight: 700; }
    .dice-rolls__bar { height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
    .dice-rolls__bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .dice-rolls__label { font-size: 0.75rem; color: #666; }
  `]
})
export class DiceRollsComponent {
  @Input() rolls: DiceRoll[] = [];

  rollColor(value: number): string {
    if (value >= 15) return '#4caf50';
    if (value >= 10) return '#ff9800';
    return '#e53935';
  }

  rollLabel(value: number): string {
    if (value >= 15) return 'Sucesso';
    if (value >= 10) return 'Sucesso parcial';
    return 'Falha';
  }
}
