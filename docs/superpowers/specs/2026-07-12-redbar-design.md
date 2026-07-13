# redbar — Design

**Data:** 2026-07-12
**Contexto:** hackathon interno. 1 mês de prazo, alvo de conclusão em 15–20 dias para sobrar tempo de teste com o time, documentação e slides.

## Problema

Não existe padrão de teste na companhia. Cada pessoa escreve teste de um jeito, ou não escreve. Quem quer testar não sabe **o que** testar, e quem usa agente de IA para escrever teste recebe um teste que segue o padrão do modelo, não o padrão da casa.

Duas lacunas distintas, e confundi-las é o erro comum:

1. **Não se sabe onde estão os buracos.** Isso é um problema de *dados*, não de IA.
2. **Quando se escreve o teste, ele sai fora do padrão.** Isso é um problema de *convenção*, não de ferramenta.

O redbar ataca as duas, mas com mecanismos diferentes: a primeira com o compilador e o git, a segunda com um documento de convenções que o agente é obrigado a ler.

## Princípio central

**Uma engine, três consumidores.**

A engine é um conjunto de funções puras: detectar stack → ler cobertura → cruzar com o diff → produzir gaps ranqueados. CLI, MCP e CI gate são cascas finas em volta dela.

Isso é o que impede o projeto de virar três projetos, e é o que permite publicar como skill pública depois sem reescrever nada — muda o empacotamento, não o núcleo.

**O `inspect` é zero-LLM.** Nenhum modelo é chamado na fase de análise. O relatório de gaps não é opinião de IA: é o relatório de cobertura e o `git diff` falando. Isso é o que dá autoridade ao número e é o argumento central do pitch.

Só o `fix` toca em agente, e toca através de um adapter pequeno.

## Arquitetura

```
redbar/
  src/
    detect.ts          # package.json | pom.xml | pyproject.toml → stack + runner existente
    coverage/
      lcov.ts          # JS/TS  (Vitest, Jest)
      jacoco.ts        # Java   (JaCoCo XML)
      cobertura.ts     # Python (coverage.py XML)
    gap.ts             # git diff main...HEAD ∩ linhas não cobertas → gaps ranqueados
    e2e.ts             # rotas ∩ specs Playwright → gaps de e2e
    report.ts          # gaps.json (agente) + REDBAR.md (humano)
    agents.ts          # adapter multi-LLM
    fix.ts             # worker pool
    conventions/       # o padrão de teste da empresa, um .md por stack
    cli.ts             # inspect | fix | init | ci
    mcp.ts             # a mesma engine exposta como MCP
  fixtures/
    ts/  spring/  py/  # repos mínimos com buraco plantado, para testar a engine
```

`gap.ts` e `coverage/*` não conhecem CLI, MCP nem processo filho. São entrada → saída.

## Fluxo

### 1. `redbar init`

Detecta o stack e o runner que já existe no projeto. Imprime o **diff** do setup recomendado (dependências + config de cobertura) e pede confirmação.

**Nunca instala dependência sozinho.** Ferramenta que mexe em `pom.xml` ou `package.json` alheio sem pedir é PR rejeitado no melhor caso e incidente de supply chain no pior. O humano dá enter.

### 2. `redbar inspect` (`/inspect`)

1. Roda o comando de cobertura que o projeto já tem.
2. Parseia o relatório no formato padrão do ecossistema (lcov / JaCoCo XML / Cobertura XML).
3. Cruza com `git diff main...HEAD`: o que **mudou** e está **sem cobertura**.
4. Ranqueia por símbolo exportado/público com zero linha coberta.
5. Enumera gaps de e2e: rotas (`app/`, `pages/`, `@RestController`, `@RequestMapping`) sem spec Playwright que as toque. Cobertura de unidade não enxerga esse buraco — precisa ser um passo próprio.
6. Escreve `.redbar/gaps.json` (para o agente) e `REDBAR.md` (para o humano e para o PR).

Roda em segundos. Sem IA.

### 3. `redbar fix` (`/fixit`)

Lê `gaps.json`, sobe um worker pool (N = número de cores). **Cada worker pega 1 gap e escreve 1 arquivo de teste.**

**Particionamento por arquivo-alvo:** dois workers nunca escrevem no mesmo arquivo. Colisão é impossível por construção — sem worktree, sem lock, sem merge. Essa é a razão de não haver isolamento de git aqui: o problema foi eliminado no desenho, não resolvido com trava.

**Gate de qualidade, por worker:**
1. Escreve o teste.
2. Roda **apenas o teste que ele escreveu**.
3. Passou → entra no relatório final.
4. Falhou → uma retentativa, com o erro no prompt.
5. Falhou de novo → marcado `needs-human` no relatório.

**Nunca deixa teste quebrado no repositório.** Um teste vermelho vazando na demo apaga todo o resto.

### 4. Relatório final

O que foi criado, qual padrão foi seguido, e por que aquele padrão é o certo para aquele caso. É a peça que fecha a narrativa da demo: buraco → tapado → justificado.

## Multi-LLM

O worker **não fala com API de LLM nenhuma.** Ele dá `spawn()` no CLI de agente que a pessoa já tem instalado.

```ts
type Agent = { cmd: string; args: (prompt: string) => string[] }
```

Suportados de fábrica: **Claude Code**, **Codex**, **Copilot**. Configuração em `redbar.config.json`:

```json
{ "agent": "copilot" }
```

Sem config: **auto-detect** — o primeiro CLI encontrado no `PATH` ganha.

**Válvula de escape**, e é ela que faz a ferramenta não morrer:

```json
{ "agent": { "cmd": "qualquer-coisa", "args": ["--prompt", "{{prompt}}"] } }
```

Isso cobre o gateway interno da empresa, um CLI que ainda não existe, e o modelo que sair no mês que vem. Adicionar um LLM é uma linha de config, não um release.

Consequências que importam: **zero SDK, zero gestão de API key, zero custo novo** — usa a licença de Copilot que a empresa já paga.

> **Item aberto:** as flags de modo headless de cada CLI mudam a cada release. Conferir na fonte (`--help` de cada um) antes de escrever o adapter. Não chutar.

Do lado do MCP, a portabilidade é de graça: Claude Code, Copilot agent mode e Codex os três falam MCP. Mesma engine, mesmas ferramentas, três clientes, zero código a mais.

## Adoção — o ponto que a maioria erra

**Não se obriga um agente a usar uma ferramenta. Obriga-se o PR.**

Três camadas, em ordem de força:

1. **CI gate** — o PR falha se o código novo/alterado tem gap acima do limite. Roda o mesmo binário do `inspect`. É a única camada que ninguém contorna.
2. **Config no repositório** — `AGENTS.md` e `.github/copilot-instructions.md` apontando para o mesmo documento de convenções. O agente carrega sozinho, sem ninguém instalar nada.
3. **MCP** — conveniência. O agente chama e já sabe o que fazer.

O MCP é o que torna agradável. O CI é o que torna obrigatório.

## Erros previstos

| Situação | Comportamento |
|---|---|
| Projeto sem cobertura configurada | `inspect` falha alto, com o comando exato do `init` |
| CLI de agente não encontrado | Mensagem clara listando os suportados e como configurar |
| Teste não passa nem na retentativa | `needs-human` no relatório. Nunca commitado |
| Repositório sem branch `main` | Base do diff configurável; default detectado do remoto |

## Como o redbar é testado

Três repositórios-fixture mínimos (`fixtures/ts`, `fixtures/spring`, `fixtures/py`), cada um com um buraco de cobertura plantado de propósito. O teste afirma que `gap.ts` encontra exatamente aquele buraco.

Um check que roda de verdade. Não uma suíte por função.

## Escopo

| Stack | `inspect` (encontra gaps) | `fix` (escreve teste) |
|---|---|---|
| TS/JS (Vitest/Jest + Playwright) | Sim | Sim |
| Java / Spring Boot (JaCoCo) | Sim | Sim |
| Python (coverage.py) | Sim | **Não** |

**Python não escreve teste.** São "alguns scripts", não é onde está a dor, e é o primeiro candidato ao corte se o cronograma apertar.

## Cronograma

| Dias | Entrega |
|---|---|
| 1–4 | **Engine.** `detect` + 3 parsers + `gap.ts`. Sem IA, sem CLI bonito. |
| 5–8 | **`/inspect`.** CLI, relatório markdown, `redbar init`, gaps de e2e. |
| 9–13 | **`/fixit`.** Worker pool, adapter multi-agente, loop de verificação, relatório final. |
| 14–15 | **MCP + CI gate.** Cascas finas — rápidas, porque a engine já existe. |
| 16–20 | **Adoção.** Doc de convenções, rodar em 3–4 repos reais, 2–3 pessoas testando, slides. |

**Checkpoint do dia 4:** rodar num repositório real da empresa e ver os gaps corretos saírem. Se isso não acontecer no dia 4, todo o resto é fantasia — e ainda restam 16 dias para corrigir a rota.

## Riscos

**O documento de convenções é a única parte que não pode ser gerada sozinha.** É o padrão de teste *desta* empresa, e precisa de gente do time opinando. É também o verdadeiro entregável — a ferramenta apenas o executa. **Puxar essa conversa no dia 1, não no dia 16.**

**Repositórios legados reais vão quebrar a engine.** Monorepo, cobertura mal configurada, código gerado, `target/` cheio de lixo. É onde se perdem 4 dias, e é onde a demo se prova. O tempo extra do cronograma existe para isso — não para features a mais.

## Fora de escopo

- Instalação automática de dependências (o `init` propõe, o humano aprova).
- Isolamento por git worktree (eliminado pelo particionamento por arquivo).
- SDK de LLM próprio, gestão de chave de API, custo de inferência novo.
- Escrita de teste em Python.
