<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
  <img alt="redbar" src=".github/assets/logo-light.svg" width="480">
</picture>

<br>

### O agente escreve os testes. O redbar decide quais, e confere.

A cobertura e o `git diff` dizem o que falta testar, sem IA no meio.
Seu agente escreve, seguindo a doc oficial de cada lib.
O redbar mede de novo e diz o que fechou de verdade.

<br>

[![release](https://img.shields.io/github/v/release/emersonjds/redbar?label=release&color=0A7EA4&sort=semver)](https://github.com/emersonjds/redbar/releases/latest)
[![ci](https://github.com/emersonjds/redbar/actions/workflows/ci.yml/badge.svg)](https://github.com/emersonjds/redbar/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-success)](package.json)
[![zero LLM na análise](https://img.shields.io/badge/an%C3%A1lise-zero%20LLM-critical)](docs/design.md)

**[Como usar](#como-usar)** · **[MCP](#mcp-conecte-no-agente-que-você-já-usa)** · **[O fluxo, desenhado](https://claude.ai/code/artifact/fac215b0-64a0-42c4-814f-eef64864049b)** · **[Design](docs/design.md)**

**Português** · [English](README.en.md)

</div>

---

## O problema que ele resolve

- Todo repositório tem teste faltando, e ninguém sabe **onde**. Cobertura de "43%" não diz se *o que você mudou ontem* está testado.
- Quando uma IA escreve o teste, sai no estilo que o modelo acordou querendo. Seis prompts, seis estilos.
- E quando a IA diz "pronto, testei", ninguém confere.

O redbar resolve os três: **mede** onde estão os buracos (sem IA), entrega o **padrão oficial** de cada lib pro agente escrever, e **mede de novo** pra conferir o que fechou.

## Por que não é só uma skill do agente?

- Uma skill pede pro modelo **adivinhar** o que está coberto. Cobertura é fato de execução: não está visível no código-fonte. O modelo chuta, com confiança.
- Pergunte duas vezes, receba duas listas. O redbar dá a mesma resposta byte a byte — e só um número que repete pode segurar um gate de CI.
- Skill é opt-in: roda quando alguém lembra. O gate roda em todo PR, inclusive pra quem não usa IA.

## E TDD, SDD?

- TDD e SDD valem pra código que **ainda vai nascer**, e pedem disciplina de todo mundo, todo dia.
- O redbar age **depois**, no repositório que já existe. Não pede adesão de ninguém: mede o que ficou sem teste.
- Não competem. TDD previne, redbar mede. O time que faz TDD perfeito não precisa do redbar — esse time não existe.

## O que já existe, e onde cada um para

| Ferramenta | O que faz | Onde para |
|---|---|---|
| Codecov / Coveralls | mostra a porcentagem | não diz **o que** testar. Termômetro, não plano |
| Copilot / Cursor "generate tests" | escreve teste do arquivo aberto | não sabe o que já está coberto — cobertura não está visível no código-fonte |
| Qodo e afins | IA escreve testes até a cobertura subir | a IA decide o que cobrir, e ninguém confere o que ela alega |
| Diffblue | gera testes sem IA | só Java, caixa preta, não conversa com o teu agente |

O espaço do redbar é a combinação que nenhuma faz: **medir sem IA, escrever com o agente que você já usa, e conferir medindo de novo.**

## O que ele responde

> **O que eu mudei que nenhum teste executa?**

```
language: TypeScript
runner:   jest
base:     origin/master
gaps:     289

! [5742] e2e          src/pages/Checkout/index.tsx:124  Checkout  — 99 linhas, 28 branches
  [ 564] integration  src/api.ts:15                     request   — 47 linhas, 11 branches
```

Cada linha: o símbolo, a camada de teste que falta (unit / integration / e2e) e a criticidade. O score é contagem, não opinião — `linhas descobertas × (zero cobertura ? 2 : 1) × (1 + branches)` — e qualquer número se audita com `redbar explain <símbolo>`.

## O fluxo inteiro

```
  seu repo, numa branch com trabalho
        │
        ▼
  MEDIÇÃO (zero IA)     coverage report × git diff → gaps ranqueados
        │
        ▼
  O DOCUMENTO           .redbar/TESTING.md — o que testar, em que ordem,
        │               em que camada, seguindo qual doc oficial
        ▼
  ESCRITA (o agente)    um gap por vez + o padrão da camada;
        │               4 portões mecânicos julgam o que ele escreveu
        ▼
  MEDIÇÃO DE NOVO       re-roda o coverage: "fechado" é fato medido, não alegação
        │
        ▼
  OUTCOME.md            o que foi MEDIDO ≠ o que o agente ALEGA, nunca misturado
```

> **[Veja o fluxo completo desenhado →](https://claude.ai/code/artifact/fac215b0-64a0-42c4-814f-eef64864049b)**

Essa divisão é o projeto inteiro: quem acha o buraco é o compilador e o git. Quem escreve é o agente. Quem confere é o compilador de novo. Teste sem asserção sobe a cobertura e não prova nada: o redbar **apaga** e marca `no-assertion`. Agente que "conserta" teu código pra fazer o teste passar: o redbar **reverte** e marca `touched-source`.

## Como usar

Roda no teu repo, e ele faz o resto: descobre a linguagem, o runner, roda a cobertura se faltar, e te diz o que testar.

**Sem instalar nada** — use via `npx`:

```bash
npx -y redbar i         # inspect — o que eu mudei que nada testa?
npx -y redbar b         # briefing — o documento pro agente + HTML + PDF pra gerência
npx -y redbar x         # execute — o agente escreve, o redbar julga e re-mede
npx -y redbar why X     # explain — de onde veio o número de X, conta por conta
```

**Ou instale global** uma vez (opcional):

```bash
npm i -g redbar
```

Depois é só:

```bash
redbar i         # inspect
redbar b         # briefing
redbar x         # execute
redbar why X     # explain
```

Cada atalho tem o nome completo (`inspect`, `briefing`, `execute`, `explain`), e `--all` em qualquer um olha o repo inteiro em vez do diff.

**Contribuir?** Clone o repo — veja [CONTRIBUTING.md](CONTRIBUTING.md).

## MCP: conecte no agente que você já usa

A forma mais simples é rodar:

```bash
redbar mcp-config <cliente>    # imprime a linha pronta pra seu cliente
redbar mcp-config              # mostra pra todos
```

redbar imprime a linha exata. Copie a saída e rode no seu terminal — isso é a autorização. Exemplos de clientes:

- **Codex / Claude Code**: `codex mcp add redbar -- npx -y redbar mcp`
- **Gemini CLI**: `gemini mcp add redbar npx -y redbar mcp` (sem `--`)
- **Cursor**: JSON em `.cursor/mcp.json`, chave `mcpServers`: `{ "command": "npx", "args": ["-y","redbar","mcp"] }`
- **VS Code**: JSON em `.vscode/mcp.json`, chave `servers`: `{ "command": "npx", "args": ["-y","redbar","mcp"] }`

Contribuidor rodando de um clone antes da publicação? Use `redbar mcp-config <cliente> --local` pra ter a forma de caminho absoluto.

**Depois de conectado, o fluxo é:**

1. Peça pro agente usar o redbar → ele chama `redbar_briefing`
2. redbar varre o código, calcula os gaps e grava `.redbar/TESTING.md` — a lista ranqueada do que testar, em que camada
3. O agente escreve os testes de cima pra baixo, seguindo o padrão oficial de cada camada

| Tool | O que faz |
|---|---|
| `redbar_briefing` | **a principal** — o documento completo: gaps ranqueados + o padrão de cada camada. O agente usa como fonte de verdade pra escrever os testes |
| `redbar_inspect` | a lista de gaps, medida |
| `redbar_explain` | a auditoria de um número — a resposta pra "isso é alucinação?" |

Os artefatos (`TESTING.md`, `gaps.json`) ficam gravados no **teu projeto**, em `.redbar/`.

Quando o redbar chegar ao npm, bastará `npx -y redbar mcp` em qualquer máquina — funciona sem clone nem link.

## O motor lê a cara do projeto

Tudo detectado do manifest, mecanicamente, sem modelo:

- **Runner** — jest ou vitest, maven ou gradle. Não assume; lê.
- **Ferramenta e2e** — Cypress no `package.json` → padrão do Cypress; senão, Playwright.
- **Perfil** — React/Vue → front (e2e primeiro no foco); Express/Spring/FastAPI → back (integration primeiro); Next/Nuxt → fullstack. Vira a seção "Focus" do relatório, **sem tocar no score** — o número continua contagem pura.

## O gate no CI

`redbar ci --max-critical 0` falha o PR quando a mudança carrega lógica com branches que nenhum teste executa — e posta a tabela como comentário no PR, editando o próprio comentário a cada push. Workflow pronto pra copiar: [.github/workflows/redbar.yml](.github/workflows/redbar.yml).

## Linguagens

- **JavaScript/TypeScript · Java · Python · Rust · PHP · Go**
- três parsers de cobertura (lcov, Cobertura, JaCoCo) cobrem todos os ecossistemas
- adicionar uma linguagem é **uma linha de dado** em `src/languages.ts` — sem código novo

## Status

| | |
|---|---|
| ✅ Motor, CLI, MCP, gate de CI, `execute` com re-medição | verificado em repositórios reais |
| ✅ Conventions | TS, Python, Java, Rust, PHP, Go — cada regra rastreável à doc da lib |
| 🚧 Worker pool do `fix` | |

## Origem

Baseado no [lagune.ai](https://github.com/wellwelwel/lagune), do [Well Poku](https://github.com/wellwelwel).

O propósito cabe numa frase: **a IA nunca dá nota na própria prova.**

## Licença

[MIT](LICENSE) © Emerson Silva
