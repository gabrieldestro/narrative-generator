import { Component, input, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { GameStateService } from '../../../../core/services/game-state.service';

export type NarrativeMessageType = 'narrative' | 'system' | 'action' | 'observation' | 'narration';

export interface NarrativeMessage {
  type: NarrativeMessageType;
  text: string;
  turnNumber?: number;
}

@Component({
  selector: 'ng-narrative-message',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './narrative-message.component.html',
  styleUrl: './narrative-message.component.scss',
})
export class NarrativeMessageComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly gameState = inject(GameStateService);

  readonly message = input.required<NarrativeMessage>();

  readonly formattedParagraphs = computed<SafeHtml[]>(() => {
    const rawText = this.message().text;
    if (!rawText) return [];

    // Split by double newlines or carriage returns to get paragraphs
    const paragraphs = rawText.split(/\r?\n\r?\n/);

    const characters = this.gameState.characters();
    const locations = this.gameState.locations();
    
    // Extract unique items from inventories
    const items = characters.reduce((acc, char) => {
      if (char.inventory) {
        char.inventory.forEach(item => {
          if (item && item.trim().length > 2) {
            acc.add(item.trim());
          }
        });
      }
      return acc;
    }, new Set<string>());

    return paragraphs.map(p => {
      // 1. Escape HTML to prevent injection
      let html = p
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // 2. Format simple markdown: **bold** and *italic*
      html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      // 3. Highlight Entities (characters, locations, items)
      const charNames = characters.map(c => c.name).filter(name => name.length > 2);
      charNames.sort((a, b) => b.length - a.length);
      for (const name of charNames) {
        const regex = new RegExp(`\\b(${this.escapeRegex(name)})\\b`, 'gi');
        html = html.replace(regex, '<span class="narrative-highlight narrative-highlight--character">$1</span>');
      }

      const locNames = locations.map(l => l.name).filter(name => name.length > 2);
      locNames.sort((a, b) => b.length - a.length);
      for (const name of locNames) {
        const regex = new RegExp(`\\b(${this.escapeRegex(name)})\\b`, 'gi');
        html = html.replace(regex, '<span class="narrative-highlight narrative-highlight--location">$1</span>');
      }

      const itemNames = Array.from(items);
      itemNames.sort((a, b) => b.length - a.length);
      for (const name of itemNames) {
        const regex = new RegExp(`\\b(${this.escapeRegex(name)})\\b`, 'gi');
        html = html.replace(regex, '<span class="narrative-highlight narrative-highlight--item">$1</span>');
      }

      // 4. Convert single newlines inside paragraph to <br>
      html = html.replace(/\r?\n/g, '<br>');

      return this.sanitizer.bypassSecurityTrustHtml(html);
    });
  });

  private escapeRegex(val: string): string {
    return val.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }
}

