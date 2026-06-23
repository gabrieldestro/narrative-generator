# Regras do Projeto: Gerador Narrativo com IA

Estas regras definem o contexto, o comportamento esperado e as preferências do desenvolvedor para todas as sessões futuras neste repositório.

## 1. Contexto do Projeto
*   **Objetivo:** Construir um motor narrativo no estilo RPG utilizando arquitetura multi-agentes. O sistema deve receber um objeto inicial (mundo e personagens), e a cada turno solicitar a ação do jogador e calcular (via LLM) as ações dos NPCs (CPU) e o resultado da narrativa (Mestre/Narrador).
*   **Restrições Principais:** O foco é rodar com **modelos locais menores** (ex: Gemma 4B via LM Studio na porta 1234). Portanto, os prompts precisam ser extremamente focados e divididos em passos lógicos para evitar alucinações. Janelas de contexto devem ser cuidadosamente gerenciadas.
*   **Fases do Projeto:** 
    1. POC e Motor CLI em Console (Atual).
    2. Encapsulamento em API (Fastify/Express).
    3. Criação de Front-end Angular.
    4. Persistência em Banco de Dados NoSQL.

## 2. Stack Tecnológica e Arquitetura
*   **Linguagem:** TypeScript (Node.js moderno, utilizando padrão ESM com `"type": "module"`).
*   **Padrões de Configuração:** `"moduleResolution": "nodenext"`. Regras restritas como `verbatimModuleSyntax` estão desativadas por preferência.
*   **Arquitetura:** Adota-se fortemente a **Clean Architecture** e o uso de **Dependency Injection** (Repository Pattern, separação de Domain, Application e Infrastructure).
*   **IA:** A comunicação com o LLM é feita via ecossistema LangChain (`@langchain/openai`, `@langchain/core`). 

## 3. Convenções de Código

*   **Idioma do código:** Toda a escrita **técnica** deve ser em **inglês**: nomes de variáveis, funções, classes, métodos, parâmetros, tipos, arquivos, comentários técnicos, mensagens de commit, nomes de teste (`it('should ...')`).
*   **Idioma da UI:** Apenas **strings exibidas ao usuário** devem estar em **português** (mensagens no console, prompts de input, labels de interface).
*   **Exemplo:** O método `getUltimaNarrativa` deve ser renomeado para `getLastNarrative`; a variável `ultimaNarrativa` para `lastNarrative`; o texto `"Save anterior encontrado!"` permanece em português por ser UI.

## 4. Preferências de Comunicação e Aprendizado
*   **Background do Usuário:** O usuário possui forte conhecimento e vivência em **C# / .NET**, mas está focado em aprender o ecossistema moderno do **Node.js**.
*   **Explicações:** Ao introduzir um conceito novo no Node/TypeScript, sempre faça paralelos com ferramentas, comportamentos ou arquiteturas do ecossistema C# (ex: `package.json` vs `.csproj`, `import` vs `using`, Injeção de Dependências, etc).
*   **Documentação:** O usuário valoriza a criação de documentações claras na pasta `docs/` para consolidar o aprendizado das ferramentas e configurações aplicadas a cada evolução da arquitetura.
*   **Sem Mágica:** Explique os "porquês" das decisões técnicas, principalmente quando contornar erros chatos de linting ou limitações do JavaScript.
