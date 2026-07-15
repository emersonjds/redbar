<div align="center">

# redbar

### O agente escreve os testes. O redbar decide quais, e confere.

**A cobertura e o `git diff` dizem o que falta testar, sem IA no meio.
Seu agente escreve os testes, seguindo a doc oficial de cada lib.
O redbar mede de novo e diz o que fechou de verdade.**

[![release](https://img.shields.io/github/v/release/emersonjds/redbar?label=release&color=0A7EA4&sort=semver)](https://github.com/emersonjds/redbar/releases/latest)
[![ci](https://github.com/emersonjds/redbar/actions/workflows/ci.yml/badge.svg)](https://github.com/emersonjds/redbar/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-success)](package.json)
[![zero LLM na análise](https://img.shields.io/badge/an%C3%A1lise-zero%20LLM-critical)](docs/design.md)

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

Instala uma vez, roda no teu repo, e ele faz o resto: descobre a linguagem, o runner, roda a cobertura se faltar, e te diz o que testar.

```bash
# instalar (ainda fora do npm — direto do clone):
git clone https://github.com/emersonjds/redbar.git && cd redbar && npm install && npm link
```

```bash
cd /teu/repo
redbar i         # inspect — o que eu mudei que nada testa?
redbar b         # briefing — o documento pro agente + HTML + PDF pra gerência
redbar x         # execute — o agente escreve, o redbar julga e re-mede
redbar why X     # explain — de onde veio o número de X, conta por conta
```

Cada atalho tem o nome completo (`inspect`, `briefing`, `execute`, `explain`), e `--all` em qualquer um olha o repo inteiro em vez do diff.

## MCP: conecte no agente que você já usa

Instalou o MCP no projeto, o agente para de chutar o que testar: pergunta ao redbar e recebe medição. Um comando por cliente:

```bash
claude mcp add redbar -- redbar mcp     # Claude Code
codex mcp add redbar -- redbar mcp      # Codex
gemini mcp add redbar redbar mcp        # Gemini CLI
copilot mcp add redbar -- redbar mcp    # Copilot CLI
```

Cursor, VS Code e qualquer outro cliente MCP: o JSON é sempre o mesmo (`.cursor/mcp.json`, `.mcp.json`; no VS Code a chave é `servers` em `.vscode/mcp.json`):

```json
{ "mcpServers": { "redbar": { "command": "redbar", "args": ["mcp"] } } }
```

| Tool | O que faz |
|---|---|
| `redbar_briefing` | **a principal** — o documento completo: gaps ranqueados + o padrão de cada camada. O agente usa como fonte de verdade pra escrever os testes |
| `redbar_inspect` | a lista de gaps, medida |
| `redbar_explain` | a auditoria de um número — a resposta pra "isso é alucinação?" |

Os artefatos (`TESTING.md`, `gaps.json`) ficam gravados no **teu projeto**, em `.redbar/`. O `execute` é só CLI, de propósito: quem chama o MCP já *é* um modelo; ele não spawna outro.

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

## Documentação

O mergulho fundo — cada decisão de design e o porquê — está em [docs/design.md](docs/design.md). Specs e planos em [docs/superpowers/](docs/superpowers/).

## Licença

[MIT](LICENSE) © Emerson Silva
