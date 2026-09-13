import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';

// Doc 27, Fase 5 (§7.3): lista de `events` (ledger factual) separada da prosa.
@Component({
  selector: 'ng-events-ledger',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './events-ledger.component.html',
  styleUrl: './events-ledger.component.scss',
})
export class EventsLedgerComponent {
  readonly gameState = inject(GameStateService);
}
