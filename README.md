# Gerador Narrativo com IA

Motor narrativo de RPG multi-agentes (Narrador, Árbitro, NPCs) em Node.js + TypeScript, rodando LLMs locais via LM Studio.

## Stack Tecnológica

| Camada | Tecnologia | Paralelo C# |
|---|---|---|
| Runtime | Node.js + TypeScript ESM | .NET runtime + C# |
| Compilação | `tsx` (TypeScript Execute) | `dotnet run` |
| Pacotes | npm / `package.json` | NuGet / `.csproj` |
| Testes | Vitest | xUnit + Moq |
| IA | LangChain (`@langchain/openai`) | --- |

## Arquitetura (Clean Architecture / Ports & Adapters)

```
src/
├── domain/                   # Entidades e interfaces (Ports)
│   ├── types.ts              # WorldConfig, WorldTemplate, GameState, Character
│   ├── ports.ts              # IUserInput, IOutputWriter
│   └── (__tests__/)
├── application/              # Casos de uso (GameEngine)
│   ├── GameEngine.ts
│   ├── prompts.ts
│   └── __tests__/
│       ├── GameEngine.test.ts
│       └── integration/
│           ├── helpers.ts
│           ├── arbiter.integration.test.ts
│           └── pipeline.integration.test.ts
├── infrastructure/           # Adaptadores concretos (Adapters)
│   ├── ConsoleInput.ts
│   ├── ConsoleOutput.ts
│   ├── JsonStateRepository.ts
│   ├── WorldTemplateRepository.ts
│   └── __tests__/
│       ├── JsonStateRepository.test.ts
│       └── WorldTemplateRepository.test.ts
└── index.ts                  # Composition Root (DI)
```

**Paralelo C#:** Essa estrutura é idêntica a um projeto .NET com pastas `Domain/`, `Application/`, `Infrastructure/`. O `index.ts` faz o papel do **Composition Root** (equivalente ao `Program.cs` que registra serviços no DI container).

### Injeção de Dependência

O `GameEngine` recebe tudo por construtor — nada de `new` dentro da classe:

```typescript
// C# equivalente: public GameEngine(IUserInput input, IOutputWriter output, ...)
constructor(
  private readonly input: IUserInput,
  private readonly output: IOutputWriter,
  private readonly repository: IStateRepository,
  private readonly llm: ChatOpenAI,
  private readonly worldTemplateRepo?: WorldTemplateRepository  // opcional
) {}
```

Isso é o **Dependency Inversion Principle** do SOLID: o domínio (`domain/ports.ts`) define as abstrações, a infraestrutura as implementa (`ConsoleInput`, `ConsoleOutput`), e o motor (`GameEngine`) só conhece as interfaces.

## Como Executar

1. Abra o **LM Studio**, carregue o modelo (ex: Gemma 4B Instruct) e inicie o servidor na porta **1234**.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Execute:
   ```bash
   npm start
   ```

## Testes

```bash
npm test                   # Unitários + Repositório (rápido ~1s)
npm run test:watch         # Modo watch (desenvolvimento)
npm run test:integration   # Todos os testes de integração (LLM real, ~3min)
```

### Rodar testes de integração individualmente

```bash
# Apenas testes do Árbitro (ações fora do tema)
npx vitest run --config vitest.integration.config.ts arbiter

# Apenas testes do pipeline NPC → Árbitro → Narrador
npx vitest run --config vitest.integration.config.ts pipeline
```

### O que cobre

- **Unitários (10 testes):** `application/__tests__/GameEngine.test.ts` — mocks de `IUserInput`, `IOutputWriter`, `IStateRepository` e `ChatOpenAI`. Valida criação de personagens (jogador + N NPCs manuais ou gerados por IA), ciclo de jogo e limitação de histórico.
- **Infraestrutura (12 testes):** `infrastructure/__tests__/JsonStateRepository.test.ts` (4 — arquivo real) + `WorldTemplateRepository.test.ts` (8 — templates `worlds/`).
- **Integração com LLM real:**
  - `integration/arbiter.integration.test.ts` (2 cenários) — valida que o Árbitro não nega ações por estilo/tema/gênero, apenas por capacidade física.
  - `integration/pipeline.integration.test.ts` (3 cenários) — pipeline completo NPC→Árbitro→Narrador para Cyberpunk, Fantasia Medieval e Terror.

**Paralelo C#:** Os mocks com `vi.fn()` são o equivalente a `Mock<IUserInput>.Setup(x => x.Question(...)).ReturnsAsync(...)` do Moq. A diferença é que no Vitest os mocks são objetos literais, sem necessidade de uma biblioteca separada como Moq/NSubstitute — o próprio test runner já fornece `vi.fn()`.

## Próximos Passos (Roadmap)

1. CLI & Core refinado (atual)
2. API com Fastify
3. Front-end Angular
4. Banco NoSQL + Memória longa (ChromaDB)

Veja `docs/` para o detalhamento de cada fase e paralelos com o ecossistema C#.
