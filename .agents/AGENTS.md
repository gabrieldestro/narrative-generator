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

## 4. Repositório
* Backend: `api/src/`, `api/worlds/`, `api/package.json`.
* Frontend: `app/src/app/`.
* Rodar comandos sempre no diretório correto: `cd api && npm run dev:api`, `cd app && ng serve`.
* Testes: `cd api && npm test` (60 testes unitários, sem LLM).

## 5. Comunicação
* Paralelos com C#/.NET ao introduzir conceitos Node.
* Documentar decisões em `docs/`.
* Explicar "porquês", especialmente ao contornar limitações ou erros de ferramentas.
