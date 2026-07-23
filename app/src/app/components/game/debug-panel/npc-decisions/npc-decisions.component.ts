import { Component, Input } from '@angular/core';
import type { NpcDecision } from '../../../../core/models/turn-result.model';

@Component({
  selector: 'ng-npc-decisions',
  standalone: true,
  template: `
    <div class="npc-decisions">
      <h4 class="section-title">DECISÃO DOS NPCS</h4>
      @if (decisions.length === 0) {
        <p class="npc-decisions__empty">Aguardando...</p>
      } @else {
        @for (dec of decisions; track $index) {
          <div class="npc-decisions__card">
            <div class="npc-decisions__name">{{ dec.characterName }}</div>
            <div class="npc-decisions__action">→ {{ dec.action }}</div>
            <div class="npc-decisions__reasoning">{{ dec.reasoning }}</div>
            <span class="npc-decisions__status" [class.npc-decisions__status--success]="dec.success">
              {{ dec.success ? '✓ Sucesso' : '✗ Falha' }}
            </span>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .npc-decisions { padding: 0.75rem; }
    .npc-decisions__empty { color: #666; font-size: 0.875rem; text-align: center; }
    .npc-decisions__card { background: #2a2a2a; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; }
    .npc-decisions__name { font-weight: 600; color: #c9a84c; }
    .npc-decisions__action { font-size: 0.875rem; color: #e0e0e0; margin-top: 0.25rem; }
    .npc-decisions__reasoning { font-size: 0.75rem; color: #a0a0a0; margin-top: 0.25rem; font-style: italic; }
    .npc-decisions__status { font-size: 0.75rem; font-weight: 600; }
    .npc-decisions__status--success { color: #4caf50; }
    .npc-decisions__status:not(.npc-decisions__status--success) { color: #e53935; }
  `]
})
export class NpcDecisionsComponent {
  @Input() decisions: NpcDecision[] = [];
}
