# Guidelines Visuais — Motor Narrativo de RPG com IA

Guia rápido para criar/refatorar telas seguindo a identidade **"Ethereal Obsidian"** (Dark Fantasy & Sci-Fi Minimalista).
Fonte original: `docs/16_diretrizes_estilo_visual.md`. Os tokens reais estão em `app/src/app/shared/styles/tokens.scss` (expostos como CSS custom properties em `:root`).

> **Regra de ouro:** nunca use cinza puro (`#000`/`#1a1a1a`), evite bordas duras de alto contraste — prefira tons escuros frios (azul/violeta) + brilhos sutis (glows).

---

## 1. Tokens (CSS custom properties)

Usar SEMPRE via `var(--token)` nos componentes. Nunca hardcodar cores.

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--bg-primary` | `#08080f` | Fundo do viewport |
| `--bg-secondary` | `#121222` | Painéis/toolbar/sidenav |
| `--bg-elevated` | `#1a1a30` | Cards, inputs, botões inativos |
| `--bg-hover` | `#242445` | Hover/active |
| `--text-primary` | `#f1f1f6` | Texto principal |
| `--text-secondary` | `#cdd6f4` | Sub-títulos/labels |
| `--text-muted` | `#a6adc8` | Descrições/hints |
| `--text-inverse` | `#08080f` | Texto escuro sobre dourado |
| `--accent` | `#ffd54f` | Ouro/Âmbar — destaques, títulos, estado ativo |
| `--accent-hover` | `#ffe082` | Hover de botões primários |
| `--accent-muted` | `#c9a84c` | Ícones secundários |
| `--border` | `rgba(137,180,250,0.08)` | Bordas translúcidas (glass) |
| `--border-light` | `rgba(137,180,250,0.15)` | Bordas em hover/inputs |
| `--divider` | `rgba(137,180,250,0.05)` | Divisórias |
| `--success` | `#a6e3a1` | Semântico verde (itens) |
| `--warning` | `#f9e2af` | Semântico amarelo |
| `--error` | `#f38ba8` | Semântico vermelho |
| `--info` | `#89b4fa` | Celeste — foco de inputs, locais |
| `--font-narrative` | `Georgia, Merriweather, serif` | Texto de leitura |
| `--font-ui` | `Outfit, Inter, system-ui` | Interface |
| `--font-mono` | `JetBrains Mono, Fira Code` | Debug/dados |
| `--max-reading-width` | `72ch` | Largura de texto narrativo |

Raio: `4px/8px/12px/16px/9999px`. Transições: `150ms/250ms/400ms ease`. Glow: `0 0 15px rgba(137,180,250,0.15)`.

## 2. Tipografia

| Papel | Família | Estilo |
| :--- | :--- | :--- |
| Títulos/brand | `'Outfit', sans-serif` | Bold (`700`–`800`), `letter-spacing` sutil, opcional caixa alta |
| Interface/UI | `'Inter', sans-serif` | `400`–`600`, altamente legível |
| Leitura narrativa | `Georgia, serif` (`var(--font-narrative)`) | `1.125rem`, `line-height: 1.8`, cor `--text-primary`, máx `72ch` |

## 3. Padrões por tela

### A. Escolha de Mundos (`new-game`)
- Grid responsivo de cards `minmax(340px, 1fr)`, gap `2rem`.
- Card: gradiente `linear-gradient(135deg, #101020 0%, #16162d 100%)`, borda `var(--border)`, raio `16px`, sombra suave.
- Hover: `transform: translateY(-6px) scale(1.01)`, borda dourada + glow `0 0 15px rgba(255,213,79,0.1)`.

### B. Criar Mundo / Configurações (formulário)
- Layout: coluna central `max-width: 820–1100px`, `padding: 3rem 1.5rem`, `background: var(--bg-primary)`.
- Header: título Outfit `800`, `2rem`, ícone `var(--accent)` + subtítulo `--text-muted`.
- Cards de seção: gradiente `linear-gradient(160deg, #0e0e22 0%, #151530 100%)`, borda `var(--border)`, raio `20px`, sombra + `inset 0 1px 0 rgba(255,255,255,0.04)`.
- Header do card: ícone `--accent`, título Outfit `700`, subtítulo `--text-muted`, divisor `--divider`.
- Labels de campo: Outfit `700`, `0.8rem`, uppercase, `letter-spacing: 0.1em`, `--text-secondary`.
- Hint abaixo de cada campo: `Inter`, `0.75rem`, `--text-muted` (sempre explicar o parâmetro).

### C. Tela de Jogo (3 painéis)
- Header: toolbar `--bg-secondary`, borda inferior `--border`, mundo + turno em `--accent` (mono), botão voltar.
- Sidenavs: `--bg-secondary`, borda `--border`; painéis com header uppercase e ícone `--accent`.
- Centro: fundo `--bg-primary` + radial gradient celeste no topo, scroll independente.
- Narrativa: `--font-narrative`, `1.125rem`, `line-height: 1.8`, `max-width: 72ch`.
- Divisórias de turno: **linha pontilhada** dourada (`border-top: 1px dotted rgba(255,213,79,0.35)`).
- Destaque de entidades no texto: amarelo personagens, azul locais, verde itens.
- Ação do jogador: itálico `--info`, borda esquerda `3px solid var(--info)`.
- Action input: selects/textarea `outline`, botão "Agir" dourado.

## 4. Componentes Material — estados ativos

Ouro/Âmbar para estado ativo (`--accent`), celeste (`--info`) para foco:

```scss
// Input/Select/Textarea outline com brilho no foco
::ng-deep {
  .mat-mdc-form-field-flex { background: var(--bg-elevated) !important; }
  .mdc-notched-outline__leading, .mdc-notched-outline__notch, .mdc-notched-outline__trailing {
    border-color: var(--border-light) !important;
  }
  &.mat-focused .mdc-notched-outline__leading,
  &.mat-focused .mdc-notched-outline__notch,
  &.mat-focused .mdc-notched-outline__trailing {
    border-color: var(--info) !important;
    box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.08);
  }
  input, textarea { color: var(--text-primary) !important; caret-color: var(--info); }
}

// Slider / Radio / Toggle ativos em dourado (exemplos)
::ng-deep {
  --mat-slider-active-track-color: var(--accent);
  --mat-slider-handle-color: var(--accent);
  --mat-slider-label-label-text-color: var(--text-inverse);
  --mat-radio-selected-icon-color: var(--accent);
  --mat-slide-toggle-selected-track-color: var(--accent);
  --mat-slide-toggle-selected-handle-color: var(--text-inverse);
}
```

## 5. Botões

- **Primário:** `linear-gradient(135deg, var(--accent) 0%, #ffb74d 100%)`, texto `--text-inverse`, Outfit `700`, raio `8px`, sombra `0 4px 12px rgba(255,213,79,0.2)`, hover `translateY(-2px)` + sombra maior.
- **Secundário (contorno):** borda `1px solid var(--border-light)`, texto `--text-muted`, raio `8px`, hover com cor semântica + fundo translúcido `rgba(..., 0.05)`.
- Transições: `transition: all 0.2s ease` (ou 0.25s em botões grandes).

## 6. Micro-interações

- Painéis colaterais: slide `ease-out` `300ms`.
- Entrada de mensagens: `fade-in` (classe global `.fade-in` — opacity 0→1, translateY 8px→0, 0.3s).
- Carregamento: pulsação suave no indicador (âmbar) + overlay com `backdrop-filter: blur(8px)`.
- Tudo que é interativo: transição em `all` (ou propriedades afetadas).

## 7. Checklist para telas novas

- [ ] Usar `var(--token)` — zero hex hardcoded.
- [ ] `mat-toolbar` no padrão (`--bg-secondary` + borda `--border` + Outfit).
- [ ] Conteúdo centralizado com `background: var(--bg-primary)`.
- [ ] Título Outfit com ícone dourado + subtítulo.
- [ ] Inputs `appearance="outline"` com glow celeste no foco.
- [ ] Slider/radio/toggle ativos em ouro/âmbar.
- [ ] Botão primário dourado / secundário com contorno.
- [ ] Hints (`0.75rem`, `--text-muted`) sob cada parâmetro.
- [ ] Animações `fade-in` em conteúdo novo, transições `0.2s` em controles.

## 8. Referências de implementação (copiar padrões)

- Formulário + cards: `app/src/app/components/settings/settings.component.{html,scss}`
- Criação de mundo (preview + inputs): `app/src/app/components/new-game/custom-scenario/custom-scenario.component.{html,scss}`
- Cards de mundo: `app/src/app/components/new-game/world-list/` e `app/src/app/shared/components/game-card/game-card.component.scss`
- Tela de jogo: `app/src/app/components/game/` (header, narrative-panel, action-input, debug-panel)
- Toolbar/página padrão: `app/src/app/components/new-game/custom-scenario-page.component.{html,scss}`
