# Regras do Projeto: Gerador Narrativo com IA

## 1. Contexto do Projeto
* Motor narrativo multi-agentes (Narrador, Árbitro, NPCs) para RPG usando LLMs locais.
* Backend em `api/` (Fastify + TypeScript ESM), frontend em `app/` (Angular 20 + Material).
* LLM local (ex: Gemma 4B via LM Studio porta 1234) — prompts focados, janela de contexto gerenciada.
* **Fases concluídas:** CLI → API Fastify → Frontend Angular. Próxima: persistência NoSQL.

## 2. Stack
* **Backend:** TypeScript ESM (`"type": "module"`), `moduleResolution: "nodenext"`, Clean Architecture (Ports & Adapters), LangChain.
* **Frontend:** Angular 20, Material 20, standalone components, Signals, `ChangeDetectionStrategy.OnPush`.

## 3. Convenções de Código
* **Código técnico em inglês:** variáveis, funções, classes, arquivos, commits, testes (`it('should ...')`).
* **UI em português:** strings exibidas ao usuário.
* **Exemplo:** método `getLastNarrative()`, texto `"Save anterior encontrado!"`.
* **Angular components:** sempre usar arquivos separados (`.ts`, `.html`, `.scss`), **nunca** `template:` inline ou `styles:` inline. Usar `templateUrl` e `styleUrl`.
* **UI nova ou refatoração de tela:** seguir o padrão visual em `.agents/visual-guidelines.md` (tokens, tipografia, componentes, checklist).

## 4. Repositório
* Backend: `api/src/`, `api/worlds/`, `api/package.json`.
* Frontend: `app/src/app/`.
* Rodar comandos sempre no diretório correto: `cd api && npm run dev:api`, `cd app && ng serve`.
* Testes: `cd api && npm test` (60 testes unitários, sem LLM).

## 5. Logging
* **Todo código novo deve ter logging estruturado** — nunca `console.log`/`console.error`.
* API: usar `ILogger` (PinoLogger) com níveis apropriados (`error` para falhas, `warn` para recuperação, `info` para fluxo, `debug` para detalhes).
* App: usar `LoggingService` (Angular) com `debug/info/warn/error`.
* Chamadas LLM: sempre passar pelo `LlmCallLogger` (métricas) e `LlmContentLogger` (conteúdo completo + tokens).
* Incluir `durationMs`, `sessionId`, `turnNumber` em logs contextuais.

## 6. Comunicação
* Paralelos com C#/.NET ao introduzir conceitos Node.
* Documentar decisões em `docs/`.
* Explicar "porquês", especialmente ao contornar limitações ou erros de ferramentas.

## 7. Trabalhos Pendentes
* **Refatorar componentes restantes** para separar HTML/CSS/TS (remover `template:` e `styles:` inline; usar `templateUrl` e `styleUrl` + arquivos `.html`/`.scss`):
  - `app/src/app/shared/components/status-badge/status-badge.component.ts` (template + styles inline)
  - `app/src/app/components/game/character-panel/character-panel.component.ts` (template inline)
  - `app/src/app/components/game/character-panel/character-sheet/character-sheet.component.ts` (template + styles inline)
  - `app/src/app/components/game/character-panel/inventory/inventory-panel.component.ts` (template + styles inline)
  - `app/src/app/components/game/character-panel/map-graph/map-graph.component.ts` (template + styles inline)
