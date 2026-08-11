import { Component, inject, computed, ElementRef, viewChild, afterRenderEffect, ChangeDetectionStrategy } from '@angular/core';
import { GameStateService } from '../../../core/services/game-state.service';
import { NarrativeMessageComponent, type NarrativeMessage } from './narrative-message/narrative-message.component';

@Component({
  selector: 'ng-narrative-panel',
  standalone: true,
  imports: [NarrativeMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './narrative-panel.component.html',
  styleUrl: './narrative-panel.component.scss',
})
export class NarrativePanelComponent {
  readonly gameState = inject(GameStateService);
  readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  readonly messages = computed<NarrativeMessage[]>(() => {
    const history = this.gameState.history();
    const msgs: NarrativeMessage[] = [];

    for (const entry of history) {
      const parsed = this.parseHistoryEntry(entry);

      // Observações não avançam o turno: renderizadas sem divisor próprio
      if (parsed.isObservation) {
        msgs.push({
          type: 'observation',
          text: parsed.narrative,
          turnNumber: parsed.turnNumber
        });
        continue;
      }

      // Push turn divider
      msgs.push({
        type: 'system',
        text: parsed.isInitial ? 'Início da Aventura' : `Turno ${parsed.turnNumber}`,
        turnNumber: parsed.turnNumber
      });
      
      // If we have actions parsed from this turn, push them
      if (parsed.actions) {
        msgs.push({
          type: 'action',
          text: parsed.actions,
          turnNumber: parsed.turnNumber
        });
      }
      
      // Push the narrative text
      msgs.push({
        type: 'narrative',
        text: parsed.narrative,
        turnNumber: parsed.turnNumber
      });
    }

    return msgs;
  });

  constructor() {
    afterRenderEffect(() => {
      this.messages();
      const el = this.scrollContainer()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  private parseHistoryEntry(entry: string): { turnNumber: number, actions?: string, narrative: string, isInitial: boolean, isObservation?: boolean } {
    if (entry.startsWith('Narrativa Inicial:')) {
      return {
        turnNumber: 1,
        narrative: entry.slice('Narrativa Inicial:'.length).trim(),
        isInitial: true
      };
    }

    const observeMatch = entry.match(/^Observação \(Turno (\d+)\):\s*([\s\S]*)$/i);
    if (observeMatch) {
      return {
        turnNumber: parseInt(observeMatch[1], 10),
        narrative: observeMatch[2].trim(),
        isInitial: false,
        isObservation: true
      };
    }
    
    const turnMatch = entry.match(/^Turno (\d+):/i);
    const turnNumber = turnMatch ? parseInt(turnMatch[1], 10) : 1;
    
    // Formato antigo (compatibilidade): "Turno X:\nAções: ...\nNarrativa: <prosa>"
    const actionsMatch = entry.match(/Ações:\s*([\s\S]*?)(?=\nNarrativa:)/i);
    const actions = actionsMatch ? actionsMatch[1].trim() : undefined;
    
    const narrativeMatch = entry.match(/Narrativa:\s*([\s\S]*)$/i);
    let narrative: string;
    if (narrativeMatch) {
      narrative = narrativeMatch[1].trim();
    } else if (turnMatch) {
      // Novo formato: "Turno X: <prosa>"
      narrative = entry.replace(/^Turno \d+:\s*/i, '').trim();
    } else {
      narrative = entry;
    }
    
    return {
      turnNumber,
      actions,
      narrative,
      isInitial: false
    };
  }
}

