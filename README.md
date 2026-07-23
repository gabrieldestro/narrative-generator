# Gerador Narrativo com IA

Motor narrativo de RPG multi-agentes (Narrador, Árbitro, NPCs) com frontend Angular + API Fastify + LLMs locais (ex: Gemma 4B via LM Studio).

```
narrative_generator_with_ai/
├── api/          Backend Fastify (TypeScript)
└── app/          Frontend Angular 20
```

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Angular 20, Angular Material, Signals |
| Backend | Node.js + TypeScript ESM, Fastify (REST + SSE) |
| IA | LangChain (`@langchain/openai`, `@langchain/core`) |
| Testes | Vitest (Unitários, Integração, E2E) |

---

## Como Executar

### Pré-requisito
Abra o **LM Studio** (ou servidor compatível com OpenAI API), carregue o modelo (ex: Gemma 4B) e inicie na porta **1234**.

### Backend (API)

```bash
cd api

# Desenvolvimento (watch mode)
npm run dev:api

# Produção
npm run start:api
```

Servidor em `http://localhost:3000`.

### Frontend (Angular)

```bash
cd app
ng serve
```

Acessar `http://localhost:4200`.

### CLI (console)

```bash
cd api
npm start
```

---

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/worlds` | Lista templates de mundo |
| `POST` | `/api/games/new` | Inicia nova sessão |
| `POST` | `/api/games/:id/turn` | Processa turno |
| `POST` | `/api/games/:id/turn/stream` | Turno com SSE streaming |
| `GET` | `/api/games/:id/state` | Estado atual da sessão |

---

## Benchmark de Performance

Executa N turnos simulados (ação do jogador hardcoded) sem LLM real, gerando relatório a partir do log `logs/llm_calls.jsonl`.

```bash
cd api

# 5 turnos (padrão)
npm run benchmark

# 10 turnos
npm run benchmark:10
```

Saída: relatório detalhado em `logs/benchmark_report.json` com estatísticas de latência, tokens e chamadas LLM.

---

## Suíte de Testes

### Backend

```bash
cd api

# Unitários (60 testes, sem LLM)
npm test

# Cobertura
npm run test:coverage

# Integração com LLM real
npm run test:integration

# End-to-End multi-turno
npm run test:e2e
```

Os testes estão divididos em 3 configurações:
- `vitest.config.ts` — Unitários (~2s)
- `vitest.integration.config.ts` — Integração com LLM (~5-10min)
- `vitest.e2e.config.ts` — E2E com LLM Juiz (~10min)

### Frontend

```bash
cd app
ng test
```

---

## Estrutura do Projeto

```
api/                          Backend (Clean Architecture)
├── src/
│   ├── domain/               Entidades e interfaces
│   ├── application/          Casos de uso (GameEngine, LlmService, NPCs)
│   ├── infrastructure/       Adaptadores (HTTP, console, persistência)
│   └── benchmark/            Scripts de performance
├── worlds/                   Templates de mundo (JSON)
└── package.json

app/                          Frontend Angular
├── src/app/
│   ├── core/                 Serviços e guards
│   ├── design-system/        Tokens, tema, componentes de UI
│   ├── features/             Páginas (new-game, game, settings)
│   └── shared/               Modelos e utilitários
└── package.json
```


