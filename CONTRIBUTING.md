# Contribuindo com o redbar

Obrigado por olhar por baixo do capô. O redbar é pequeno de propósito — dá pra ler o núcleo numa
sentada — e as contribuições que mais ajudam são as que o mantêm assim.

## As regras que governam toda mudança

Estão num lugar só, e não vou repeti-las aqui pra elas não divergirem: **[AGENTS.md](AGENTS.md)**.
Leia antes de abrir um PR. Em uma frase cada:

- **Zero LLM em `src/`** — a análise é medição, não opinião de modelo.
- **Zero dependências de runtime** — `dependencies` fica vazio; o CI quebra se aparecer uma.
- **Adicionar linguagem, agente ou cliente MCP é uma linha de dado** — em `src/languages.ts`,
  `src/agents.ts`, `src/clients.ts`. Um `switch (id)` fora dessas tabelas é o sinal de que o
  design falhou.
- **Determinismo** — mesma entrada, mesma saída, byte a byte.
- **redbar nunca instala nada** — imprime o comando; o humano roda.

## Rodando

```bash
npm install
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run coverage    # escreve coverage/lcov.info
npm run try -- .    # roda o redbar no próprio redbar
```

**Teste primeiro.** Escreva o teste que falha, veja falhar, então implemente. E o padrão de teste é
sempre a doc da própria lib, nunca invenção da casa — está em `conventions/`.

**Ache antes de escrever.** Fixture testa o que você já imaginou; repositório real testa o que você
não imaginou. Antes de dizer que uma mudança funciona, rode o redbar num repo de verdade.

## Commits e PRs

- Conventional commits, minúsculos, sem ponto final. Ex.: `fix(mcp): resolve o binário pelo caminho absoluto`.
- Micro commits: um assunto por commit.
- **Sem rodapé de co-autor, sem emoji, sem menção a IA/agente** — o autor é você.
- No PR: o que muda, por quê, e como você verificou (o comando e a saída).

## Achou um bug ou tem uma ideia?

Abra uma [issue](https://github.com/emersonjds/redbar/issues) — tem template pra bug e pra ideia.
Um repro pequeno e real vale mais que uma descrição longa.
