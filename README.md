# Gerador Narrativo com IA

Motor narrativo de RPG multi-agentes (Narrador, Árbitro, NPCs) em Node.js + TypeScript com suporte a modo CLI e API REST/SSE com **Fastify**, integrados a LLMs locais (ex: Gemma 4B via LM Studio na porta 1234).

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js + TypeScript ESM (`"type": "module"`) |
| Framework Web | **Fastify** (REST + Streaming SSE) |
| Compilação | `tsx` (TypeScript Execute) |
| Testes | Vitest (Unitários, Integração e E2E) |
| IA | LangChain (`@langchain/openai`, `@langchain/core`) |

---

## Arquitetura (Clean Architecture / Ports & Adapters)

```
src/
├── domain/                     # Entidades e interfaces de domínio (Ports)
│   ├── types.ts                # WorldTemplate, GameState, Character, PlayerActionPayload
│   └── ports.ts                # IUserInput, IOutputWriter
├── application/                # Casos de Uso e Orquestração
│   ├── GameEngine.ts           # Motor narrativo principal (CLI e API processTurn)
│   ├── ActionBuilderService.ts # Processamento e envelope de ações do jogador (Skills)
│   ├── GameManagementService.ts# Mutações de estado (inventário, personagens, locais)
│   ├── LlmService.ts           # Chamadas ao LLM (narrador, árbitro, extrações)
│   ├── SessionFactory.ts       # Setup de novo jogo (template ou custom)
│   ├── prompts.ts              # Templates de prompt dos agentes
│   └── npcAgent/
│       ├── CpuReflectionService.ts   # Decisão autônoma dos NPCs (reflexão + scratchpad)
│       └── SceneContext.ts           # Consciência de local e personagens da cena
├── infrastructure/             # Adaptadores concretos (Adapters)
│   ├── http/                   # Servidor HTTP Fastify
│   │   ├── controllers/        # GameController (Endpoints HTTP)
│   │   ├── routes/             # Definição de rotas + JSON Schema Validation
│   │   ├── SessionRepository.ts# Armazenamento em memória das sessões ativas
│   │   ├── server.ts           # Instanciação do Fastify, CORS e plugins
│   │   └── __tests__/          # Testes de API HTTP via app.inject()
│   ├── ConsoleInput.ts         # Leitor CLI
│   ├── ConsoleOutput.ts        # Escritor CLI
│   ├── JsonStateRepository.ts  # Persistência em arquivo JSON
│   ├── WorldTemplateRepository.ts # Leitor dos arquivos .json do diretório worlds/
│   └── LlmCallLogger.ts        # Instrumentação e logs de chamadas LLM
├── worlds/                     # Templates de mundo pré-configurados (JSON)
├── api.http                    # Arquivo de requisições HTTP para testar a API no VS Code
├── server.ts                   # Ponto de entrada da API HTTP Fastify
└── index.ts                    # Ponto de entrada do CLI (Composition Root)
```

---

## Como Executar o Projeto

### Pré-requisito
Abra o **LM Studio** (ou outro servidor compatível com OpenAI API), carregue o modelo desejado (ex: Gemma 4B Instruct) e inicie o servidor na porta **1234**.

### 1. Executando como API HTTP (Fastify)

```bash
# Modo desenvolvimento (Watch mode)
npm run dev:api

# Modo produção
npm run start:api
```
O servidor estará rodando em `http://localhost:3000`.

#### Testando as requisições HTTP da API
Você pode usar o arquivo [api.http](file:///C:/Users/destr/Documents/estudos/node/narrative_generator_with_ai/api.http) diretamente no VS Code com a extensão **REST Client** ou no HTTP Client do IntelliJ/WebStorm:
- `GET /api/worlds` — Listar templates de mundos.
- `POST /api/games/new` — Iniciar uma nova sessão de jogo.
- `POST /api/games/:sessionId/turn` — Processar 1 turno de ação.
- `POST /api/games/:sessionId/turn/stream` — Processar 1 turno transmitindo a narração via **Server-Sent Events (SSE)** em tempo real.
- `GET /api/games/:sessionId/state` — Consultar o estado atual (personagens, inventário e mapa).

### 2. Executando como Terminal (CLI)

```bash
npm start
```

---

## Suíte de Testes

O projeto possui testes automatizados em três níveis independentes:

```
vitest.config.ts              # Unitários e testes de API (~1-2s, sem LLM real)
vitest.integration.config.ts  # Integração com LLM real no LM Studio (~5-10min)
vitest.e2e.config.ts          # End-to-End multi-turno com avaliação por LLM Juiz (~10min)
```

### Comandos de Teste

```bash
# Executa todos os 60 testes unitários e de API (sem necessidade de LLM ligado)
npm test

# Modo assistido (watch)
npm run test:watch

# Gera relatório de cobertura de código em HTML (coverage/index.html)
npm run test:coverage

# Suíte de integração com LLM real no LM Studio
npm run test:integration

# Suíte End-to-End completa (gera relatório em test-output/)
npm run test:e2e
```

### O que cada camada valida

**Unitários & API (60 testes):**
| Arquivo | Qtd | O que valida |
|---------|-----|-------------|
| `api.test.ts` | 7 | Endpoints Fastify (`GET /worlds`, `POST /games/new`, `POST /turn`, `POST /turn/stream`, `GET /state`) via `app.inject()` |
| `ActionBuilderService.test.ts` | 4 | Formatação e envelope de ações (Skills/Intenções) + fallback simples |
| `GameEngine.test.ts` | 11 | Ciclo completo, save/load, sumarização, extração de local, paralelismo de NPCs |
| `GameManagementService.test.ts` | 5 | Mutações de inventário, status de personagens e auto-update |
| `SessionFactory.test.ts` | 8 | Instanciação por template, cenários custom e fallbacks |
| `CpuReflectionService.test.ts` | 14 | Reflexão autônoma de NPCs, retries e scratchpad |
| `SceneContext.test.ts` | 6 | Consciência de local e agrupamento de personagens na cena |
| `JsonStateRepository.test.ts` | 4 | Persistência local e integridade |
| `WorldTemplateRepository.test.ts` | 8 | Carregamento dinâmico de templates da pasta `/worlds/` |

---

## Documentação Técnica Detalhada

Todas as decisões arquiteturais e planos de evolução estão documentados na pasta [`docs/`](file:///C:/Users/destr/Documents/estudos/node/narrative_generator_with_ai/docs/):

- [planejamento_futuro.md](file:///C:/Users/destr/Documents/estudos/node/narrative_generator_with_ai/docs/planejamento_futuro.md) — Visão geral do Roadmap do projeto.
- [11_plano_migracao_api_fastify.md](file:///C:/Users/destr/Documents/estudos/node/narrative_generator_with_ai/docs/11_plano_migracao_api_fastify.md) — Comparativo técnico entre Express vs Fastify com paralelos C#/.NET.
- [12_implementacao_api_fastify.md](file:///C:/Users/destr/Documents/estudos/node/narrative_generator_with_ai/docs/12_implementacao_api_fastify.md) — Especificação completa dos contratos HTTP e eventos SSE.
