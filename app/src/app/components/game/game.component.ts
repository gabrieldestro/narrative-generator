import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { GameStateService } from '../../core/services/game-state.service';
import { CollapsiblePanelComponent } from '../../shared/components/collapsible-panel/collapsible-panel.component';
import { GameHeaderComponent } from './header/game-header.component';
import { NarrativePanelComponent } from './narrative-panel/narrative-panel.component';
import { ActionInputComponent } from './action-input/action-input.component';
import { CharacterPanelComponent } from './character-panel/character-panel.component';
import { DebugPanelComponent } from './debug-panel/debug-panel.component';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="game-layout">
      <ng-game-header/>

      <mat-sidenav-container class="game-layout__body">
        <mat-sidenav
          class="game-layout__sidenav game-layout__sidenav--start"
          [opened]="gameState.leftPanelOpen()"
          (openedChange)="gameState.leftPanelOpen.set($event)"
          mode="side"
          position="start"
          role="complementary"
          aria-label="Painel de estado do personagem">
          <ng-collapsible-panel title="Estado" icon="📋" [defaultOpen]="true">
            <ng-character-panel/>
          </ng-collapsible-panel>
        </mat-sidenav>

        <mat-sidenav-content class="game-layout__center" role="main">
          <ng-narrative-panel/>
          <ng-action-input/>
        </mat-sidenav-content>

        <mat-sidenav
          class="game-layout__sidenav game-layout__sidenav--end"
          [opened]="gameState.rightPanelOpen()"
          (openedChange)="gameState.rightPanelOpen.set($event)"
          mode="side"
          position="end"
          role="complementary"
          aria-label="Painel técnico do motor narrativo">
          <ng-collapsible-panel title="Técnico" icon="📖" [defaultOpen]="true">
            <ng-debug-panel/>
          </ng-collapsible-panel>
        </mat-sidenav>
      </mat-sidenav-container>
    </div>
  `,
  styles: [`
    .game-layout { display: flex; flex-direction: column; height: 100vh; }
    .game-layout__body { flex: 1; }
    .game-layout__sidenav { border: none; background: #222; }
    .game-layout__sidenav--start { border-right: 1px solid #333; }
    .game-layout__sidenav--end { border-left: 1px solid #333; }
    .game-layout__center { background: #1a1a1a; display: flex; flex-direction: column; }

    @media (max-width: 767px) {
      mat-sidenav { width: 100% !important; }
    }

    @media (min-width: 768px) and (max-width: 1279px) {
      mat-sidenav { width: 240px; }
    }
  `]
})
export class GameComponent {
  readonly gameState = inject(GameStateService);
}
