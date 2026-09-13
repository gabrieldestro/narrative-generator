import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { GameStateService } from '../../core/services/game-state.service';
import { CollapsiblePanelComponent } from '../../shared/components/collapsible-panel/collapsible-panel.component';
import { GameHeaderComponent } from './header/game-header.component';
import { NarrativePanelComponent } from './narrative-panel/narrative-panel.component';
import { ActionInputComponent } from './action-input/action-input.component';
import { CharacterPanelComponent } from './character-panel/character-panel.component';
import { DebugPanelComponent } from './debug-panel/debug-panel.component';
import { TurnQueueComponent } from './turn-queue/turn-queue.component';
import { EventsLedgerComponent } from './events-ledger/events-ledger.component';

@Component({
  selector: 'ng-game',
  standalone: true,
  imports: [
    MatSidenavModule,
    CollapsiblePanelComponent,
    GameHeaderComponent,
    NarrativePanelComponent,
    ActionInputComponent,
    CharacterPanelComponent,
    DebugPanelComponent,
    TurnQueueComponent,
    EventsLedgerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game.component.html',
  styleUrl: './game.component.scss',
})
export class GameComponent {
  readonly gameState = inject(GameStateService);
}
