# redbar — o design, decisão por decisão

> O mergulho fundo. O [README](../README.md) é o resumo; este documento guarda cada decisão
> de design e o porquê dela, na íntegra.

---

## O problema

Ninguém discute que teste importa. Times ainda lançam sem teste, e quase nunca é preguiça. São dois problemas diferentes tratados como um só:

**1. Ninguém sabe onde estão os buracos.** A cobertura marca 43%, e esse número não diz nada sobre se *o que você lançou na terça passada* tem teste. Isso é um **problema de dado**, não de IA.

**2. Quando alguém escreve um teste, ele sai num estilo que ninguém combinou.** Seis devs, seis estilos. Passa pra um agente de IA e você ganha um sétimo: o que o modelo sentiu vontade de fazer naquela manhã. Isso é um **problema de convenção**, não de ferramenta.

Misturar os dois é o erro clássico. O redbar ataca os dois, com mecanismos diferentes: o primeiro com o compilador e o git, o segundo com uma spec que o agente é obrigado a ler. **O padrão documentado da própria biblioteca**, pra que o critério de desempate não seja mais uma opinião.

## O que ele faz

Ferramenta de cobertura te diz que porcentagem do código está coberta. Inútil numa tarde de terça-feira.

O redbar responde a única pergunta que importa num pull request:

> **O que eu acabei de mudar que nada testa?**

Ele lê o relatório de cobertura que seu projeto já produz, cruza com `git diff main...HEAD`, e ordena o que sobrou por quão perigoso é.

```
language: TypeScript
runner:   jest
base:     origin/master
gaps:     289

! [5742] e2e          src/pages/Checkout/index.tsx:124  Checkout      — 99 line(s), 28 branch(es)
! [4800] e2e          src/pages/Register/index.tsx:146  Register      — 100 line(s), 23 branch(es)
! [ 798] e2e          src/pages/Product/index.tsx:40    narrowAsset   — 21 line(s), 18 branch(es)
  [ 564] integration  src/api.ts:15                     request       — 47 line(s), 11 branch(es)
  [ 340] unit         src/components/ui/Button.tsx:22   Button        — 96 line(s),  7 branch(es)
```

Leia uma linha disso: um nome de símbolo, o tipo de teste que falta, quantas linhas descobertas você adicionou, e quantos branches estão escondidos ali. `!` significa que o símbolo não tem **nenhuma** cobertura. Isso é uma lista de afazeres, não um painel.

## O fluxo inteiro, ponta a ponta

Você aponta o redbar pra um repo. Ele te leva de "não sei o que não tem teste" até "código testado, e um relatório do que aconteceu". A linha no meio é o design inteiro: **tudo acima dela é medido, nada acima dela chama um modelo.**

```
  você: um repo, numa branch com trabalho feito
        │
        ▼
  ┌─────────────────────────  A MEDIÇÃO  ·  zero LLM  ──────────────────────────┐
  │  1. detecta a linguagem e o runner        a partir do manifesto do projeto  │
  │  2. pega um relatório de cobertura        roda o comando do projeto se não  │
  │                                            houver um                        │
  │  3. cruza com  git diff base...HEAD       mudou ∩ descoberto                │
  │  4. atribui cada linha descoberta a um símbolo, ordena, marca               │
  │     unit/integration/e2e                                                    │
  └────────────────────────────────────┬────────────────────────────────────────┘
        │
        ▼
   o documento        .redbar/TESTING.md · gaps.json · REDBAR.html · REDBAR.pdf
        │             o que testar, em que ordem, em qual camada, seguindo qual
        │             padrão
        │
  ══════╪═══════════  a fronteira: um modelo é permitido aqui, e em nenhum      ═════
        │             lugar acima
        ▼
  ┌─────────────────────────  A ESCRITA  ·  um modelo, só julgamento  ─────────┐
  │  5. entrega cada buraco ao agente, um de cada vez, com o padrão canônico   │
  │     da camada                                                             │
  │  6. barra o que ele escreveu   escopo · um arquivo · asserção · execução  │
  │     (agente: sem voto)                                                    │
  │  7. RODA a cobertura de novo, inspeciona de novo   um buraco está         │
  │     "fechado" porque o relatório diz                                     │
  └────────────────────────────────────┬───────────────────────────────────────┘
        │
        ▼
   o resultado        .redbar/OUTCOME.md · .html · .pdf
                      vereditos medidos, e o relato do próprio agente, nunca
                      misturados
```

Duas metades, uma linha entre elas. A metade de cima é o compilador e o git. Roda duas vezes, sai o mesmo byte. A metade de baixo é onde o modelo finalmente faz a única coisa que ele sabe fazer bem: escrever um teste. E mesmo aí ele não tem voto sobre se o buraco realmente fechou. Isso é medido de novo, a partir de um relatório de cobertura novo.

> **[Veja o fluxo inteiro num diagrama →](https://claude.ai/code/artifact/fac215b0-64a0-42c4-814f-eef64864049b)** Os doze passos, a fronteira, e a segunda medição, do início ao fim.

### Encontrando os buracos: quatro passos, sem mágica

1. **Detecta** a linguagem e o runner de teste a partir do manifesto do projeto.
2. **Pega** o relatório de cobertura que o projeto produz. Se não existir, roda o comando de cobertura do próprio projeto pra gerar um; se estiver mais velho que o código, avisa, porque um relatório desatualizado é ótimo pra esconder os buracos mais novos.
3. **Cruza** com o diff: o que *mudou* e está *descoberto*.
4. **Ordena** por criticidade, e marca cada buraco como `unit`, `integration` ou `e2e`.

### A análise é zero-LLM, e esse é o ponto inteiro

Nenhum modelo é chamado em nenhum ponto desse pipeline. O relatório de buracos não é opinião de IA. É o seu relatório de cobertura e o seu `git diff` falando.

Isso não é purismo. É de onde vem a autoridade do número. Um número errado vindo de um modelo de linguagem é ruim. **Um número errado vindo de uma regex é pior**, porque chega vestido de compilador. Por isso a análise fica mecânica, determinística e dá pra conferir na mão. E ela dá a mesma resposta duas vezes.

Só a *escrita* de um teste passa por um agente, e isso acontece através de um adaptador pequeno.

### Duas metades, e só uma delas é modelo

Essa é a forma da ferramenta inteira, e o motivo do slogan ser esse:

| | Quem faz | Por quê |
|---|---|---|
| **Encontrar os buracos** | O compilador e o git. **Zero LLM.** | Um número que dá pra conferir, e que sai igual duas vezes. |
| **Escrever os testes** | Agentes (Claude Code, Codex ou Copilot) **lendo a sua spec**. | Escrever um bom teste é julgamento. É pra isso que modelo serve. |

Inverter isso é como ferramenta acaba pedindo pra um modelo *chutar* cobertura. O redbar pede pro modelo fazer a única coisa que ele realmente sabe fazer bem, e mais nada.

### Guiado por spec: o agente especialista **é** um arquivo markdown

Aqui está a parte que a maioria das ferramentas de teste com IA erra. Elas entregam um arquivo pro modelo e pedem um teste. O que volta está escrito no estilo **do modelo**: o que ele mais viu no GitHub naquele dia. E isso muda de execução pra execução. Seis prompts, seis estilos. Exatamente o problema que você queria resolver.

Por isso o redbar nunca pede pra um agente inventar um padrão. Ele entrega um:

```
prompt = conventions/<language>/<layer>.md   ← o padrão canônico da biblioteca
       + o buraco (arquivo, símbolo, linhas descobertas, branches)
       + o código-fonte
       + uma instrução: escreva exatamente esse arquivo de teste, não mude mais nada
```

**O "especialista sênior em teste de integração em Rust" *é* o arquivo `conventions/rust/integration.md`.** Não existe uma frota de 30 prompts ajustados na mão pra manter. Trocar o especialista é editar um arquivo markdown. Sem release, sem deploy.

#### O padrão é da biblioteca, não de um comitê

Essa é uma inversão deliberada, e é a decisão mais importante do projeto.

O óbvio é escrever *o padrão de teste da sua empresa* e alimentar o agente com isso. Também está errado. A reclamação é **"cada um escreve teste do seu jeito"**, e criar um padrão da casa não resolve isso, **adiciona um sétimo jeito.** Mais uma opinião, escrita por quem apareceu na reunião, que fica velha no minuto em que o autor troca de time.

Já existe um critério de desempate, e é de graça:

| Camada | A spec é | Direto de |
|---|---|---|
| **e2e** | Locators por papel (role), asserções web-first, sem seletor CSS | [Playwright Best Practices](https://playwright.dev/docs/best-practices) |
| **unit** (TS) | Idioma Vitest / Jest: afirma comportamento, não faz mock de nada | a documentação oficial do Vitest |
| **unit** (Python) | `assert` puro, fixtures em vez de `setUp` | a documentação do pytest |
| **unit** (Java) | JUnit 5 + Mockito | o guia oficial do JUnit 5 |
| **integration** (Java) | `@SpringBootTest` + Testcontainers | a documentação do Spring e do Testcontainers |
| **unit** (Rust) | `#[cfg(test)] mod tests` | The Rust Book, cap. 11 |

**Ninguém discute com a documentação do Playwright numa revisão de código. Todo mundo discute com o padrão que um colega inventou semana passada.** Essa assimetria é o ponto inteiro. E o modelo foi *treinado* nessa documentação, então ele segue ela muito mais fiel do que qualquer coisa que você escreveu na terça.

Toda convenção responde às mesmas cinco perguntas, então dá pra comparar o padrão de duas linguagens lado a lado:

1. Onde o arquivo de teste mora
2. Como é um teste (um exemplo real, pronto pra copiar e colar)
3. O que afirmar, e o que **não** afirmar
4. O que mockar, e o que nunca mockar *(a linha entre unit e integration mora aqui)*
5. Nomenclatura

#### Quando o seu projeto é mesmo diferente

Algumas escolhas são mesmo locais, e nenhuma biblioteca documenta: MSW ou nock? Qual fixture factory? Testcontainers, ou um banco de staging compartilhado?

```
conventions/<lang>/<layer>.md          # vem com o redbar, o padrão da biblioteca
.redbar/conventions/<lang>/<layer>.md  # opcional, os deltas do seu projeto, anexados
```

Você parte do padrão e declara só os seus deltas. **Se esse arquivo de override começar a crescer, esse é o sinal de alerta.** Um projeto que sobrescreve tudo não adotou padrão nenhum, só escreveu um estilo da casa com passo extra.

### Toda camada, decidida pra você

Você não diz ao redbar que tipo de teste precisa, e nem um modelo diz. Ele infere a partir do código, do jeito que um sênior faria em dois segundos:

| Sinal no arquivo | Camada |
|---|---|
| Uma rota ou controller: `pages/`, `routes/`, `@RestController`, `#[get(`, `Route::`, `app/**/page.tsx` do Next.js | **e2e** |
| Uma fronteira de I/O: `repository`, `dao`, `client`, `gateway`, ou importa `sql` / `mongo` / `axios` / `jdbc` | **integration** |
| Qualquer outra coisa | **unit** |

Um buraco marcado `e2e` recebe `conventions/<lang>/e2e.md`. Um buraco marcado `unit` recebe o de unit. A camada escolhe a spec, a spec escolhe o estilo.

É uma heurística, e às vezes erra. Tudo bem: o custo de errar é um teste na camada errada, não um teste quebrado. Colocar um modelo aqui compraria muito pouco e custaria a garantia zero-LLM que faz o número valer confiança.

### Ranking: qual buraco realmente importa

Nem toda linha descoberta é igual. Uma função reta de 30 linhas é mais segura do que uma de 3 linhas com quatro branches dentro.

```
score = uncovered lines × (symbol has zero coverage ? 2 : 1) × (1 + branches)
```

Contagem, não opinião. `branches` é uma contagem de `if` / `for` / `while` / `case` / `catch` / `&&` / `||`, lida direto do código, ignorando os que estão dentro de comentários, strings e regex literais.

### Criticidade: o que corrigir primeiro

Um score de `5742` não diz a ninguém o que fazer numa segunda-feira. Uma faixa diz. Ela vem de dois fatos já medidos: **alguma parte desse símbolo está coberta?** e **quanto branch está escondido nele?** E nada mais.

|  | 0 branches | 1-4 branches | 5+ branches |
|---|---|---|---|
| **sem cobertura** | medium | **high** | **critical** |
| parcialmente coberto | low | low | medium |

O limite de 5 é o de [McCabe](https://en.wikipedia.org/wiki/Cyclomatic_complexity): passou disso, a função precisa de teste. **Lógica de branch sem teste é a pior célula**: cada branch é um caminho que nada nunca executou. Código reto sem teste é ruim mas limitado. Código parcialmente coberto pelo menos tem um teste apontando pra ele que alguém pode estender.

### O documento: uma inspeção, todo público

A mesma medição, renderizada pra quem está lendo. Elas não podem discordar entre si, e essa é a única propriedade que faz um relatório valer a pena entregar pra alguém que não vai rodar de novo.

| Arquivo | Pra quem | O que é |
|---|---|---|
| `.redbar/TESTING.md` | **o agente** | o briefing de onde ele escreve os testes: o trabalho, a ordem, a camada, o padrão, a origem de cada número. Autocontido: cola em qualquer agente, sem precisar do redbar |
| `.redbar/gaps.json` | **máquinas** | o contrato estável: cada buraco mais sua severidade, e um flag quando o relatório está desatualizado |
| `REDBAR.html` | **você** | uma tabela ordenada com folha de estilo pra impressão |
| `REDBAR.pdf` | **gestão** | os mesmos números; ninguém encaminha print de terminal |
| um comentário de PR com `<!-- redbar -->` | **o revisor** | a tabela de buracos, editando o próprio comentário a cada push em vez de empilhar |

```bash
redbar briefing            # imprime o briefing e escreve TESTING.md + HTML + PDF
redbar inspect --html x.html --md x.md   # a tabela, o comentário do PR
```

O PDF sai do Chrome que já está na máquina, rodando a própria folha de estilo de impressão. Nenhuma biblioteca de PDF na árvore de dependências. Sem navegador instalado? O HTML carrega o estilo, então `Cmd+P` produz o mesmo arquivo.

## "Por que não só escrever uma skill pra isso?"

Objeção justa. Você já tem um agente. Escreve uma skill, *"olha o diff, acha o que não tem teste, escreve os testes"*, e está pronto numa tarde. Então por que uma ferramenta?

Porque skill é **prompt**, e a metade difícil desse problema **não é um problema de prompt.**

| | Skill / prompt | redbar |
|---|---|---|
| **Onde estão os buracos?** | O modelo lê o código e *chuta* o que parece sem teste. Ele nunca executou uma linha sequer. | Ele lê o relatório de cobertura. O runner já **mediu** quais linhas executaram. Não é inferência, é medição. |
| **A resposta é estável?** | Pergunta duas vezes, ganha duas respostas. Modelo diferente, lista diferente. | Determinístico. Mesma entrada, mesma saída, byte a byte. Dá pra diffar num PR. |
| **Dá pra confiar no número?** | É opinião, e opinião não derruba um build. | É `git diff ∩ descoberto`. Dá pra conferir na mão. |
| **Roda quando ninguém lembra?** | Só quando um humano invoca, numa máquina que tem instalado. | **Portão de CI.** Roda em todo PR, pra todo mundo, incluindo quem não usa IA. |
| **Funciona no Codex? No Copilot?** | Skill é específica do harness. Reescreve. | Um motor, quatro faces: CLI, MCP, CI, biblioteca. Qualquer agente, ou nenhum. |
| **O teste que ele escreveu passa mesmo?** | O modelo diz que sim. | Ele **roda** o teste. Falha duas vezes → marcado `needs-human` e apagado. **Nunca comita vermelho.** |
| **Quanto custa escanear um repo grande?** | O modelo precisa ler o código pra achar candidatos: lento, caro, e ainda assim erra coisa. | Segundos. Lê um relatório e um diff. Zero tokens. |

### As duas falhas que um prompt não resolve

**1. Um modelo não pode saber o que está coberto.** Cobertura é um fato de *runtime*: quais linhas o conjunto de testes realmente executou. Não é visível no código-fonte. Um agente olhando pra `payment.ts` não consegue dizer se a linha 42 rodou ontem à noite. Ele só pode chutar, com confiança. O redbar não chuta: o relatório de cobertura já tem a resposta, medida pelo runner.

Essa é a primeira metade inteira do problema, e é um **problema de dado, não de IA.** Recorrer a um modelo aqui é usar a única ferramenta que estruturalmente não consegue responder a pergunta.

**2. Prompt é opcional, e opcional não muda um time.** O dev que já escrevia teste vai rodar sua skill. O que não escrevia, não vai. Nada mudou.

> **Você não consegue forçar um agente a usar uma ferramenta. Você força o pull request.**

O portão de CI é a única camada que ninguém consegue desviar. E um portão precisa de um número *reprodutível*, não da opinião de um modelo que varia a cada execução. Uma skill nunca pode ser esse portão, não importa quão bom seja o prompt.

### E a skill não é a inimiga

O redbar não substitui seu agente, ele **mira** o agente.

Aponta o servidor MCP do redbar pro Claude Code, Codex ou Copilot, e o agente para de chutar o que testar. Ele recebe o símbolo exato, as linhas descobertas exatas, e a spec canônica da camada. **A skill é consumidora do redbar, não concorrente dele.**

O que o redbar contribui é a parte que um prompt estruturalmente não consegue: **a medição, o determinismo, e o portão.**

## Por que dez linguagens não custam dez vezes mais

Essa é a decisão de design em que o projeto inteiro se apoia.

**Formato de cobertura não multiplica com linguagem.** Não existe um formato por linguagem, existe um formato por ecossistema de ferramentas, e as linguagens se agrupam em três deles:

| Formato | No registro hoje | O mesmo parser também lê |
|---|---|---|
| **lcov** | JavaScript, TypeScript, Rust | Ruby, C/C++, Swift |
| **Cobertura XML** | Python, PHP, Go | C# (coverlet), Kotlin via Gradle |
| **JaCoCo XML** | Java | Kotlin, Scala, Groovy |

**Três parsers, e a parte difícil já está pronta pra coluna da direita também.** Tudo que realmente muda entre linguagens (o marcador de raiz, o runner, o comando de cobertura, onde o relatório cai, quais bibliotecas instalar, a regex que identifica um símbolo público) é **dado**, não código.

### Adicionar uma linguagem é uma linha

É uma linha numa tabela (`src/languages.ts`):

```ts
{
  id: 'ruby',
  name: 'Ruby',
  markers: ['Gemfile'],
  format: 'lcov',                                  // reaproveita o parser que já existe
  runners: [{
    name: 'rspec',
    detect: /rspec/,
    coverageCommand: 'COVERAGE=lcov bundle exec rspec',
    reportPath: 'coverage/lcov/project.lcov',
  }],
  sourceExtensions: ['.rb'],
  testFilePattern: /(^|\/)spec\/|_spec\.rb$/,
  symbolPatterns: [/^\s*def\s+(\w+)/, /^\s*class\s+(\w+)/],
  testLibs: { unit: ['rspec'], integration: ['rspec', 'webmock'], e2e: ['capybara'] },
  installCommand: (libs) => `bundle add --group test ${libs.join(' ')}`,
  canFix: true,
}
```

Nenhum módulo novo. Nenhum `switch (language)` em lugar nenhum do código. Se um aparecer, o design falhou. Essa restrição é forçada na revisão, e é por isso que a ferramenta cresce pros lados sem ficar mais pesada.

## O que ele faz por um time de desenvolvimento

Uma ferramenta que ninguém roda é uma ferramenta que não existe. O redbar foi desenhado em torno de um fato seco:

> **Você não consegue forçar um agente a usar uma ferramenta. Você força o pull request.**

Três camadas, em ordem crescente de força:

| Camada | O que é | Quem ela vincula |
|---|---|---|
| **Portão de CI** | O PR falha quando código novo ou mudado carrega buracos acima do limite. Mesmo binário da execução local. | **Todo mundo. Ninguém desvia.** |
| **Config do repo** | `AGENTS.md` e `.github/copilot-instructions.md` apontam pro mesmo documento de convenções. | Todo agente de IA, automaticamente. Ninguém instala nada |
| **MCP** | O agente chama o redbar direto e já sabe o que fazer. | Quem quiser a conveniência |

**MCP é o que torna agradável. CI é o que torna obrigatório.** Os dois juntos, ou nenhum funciona.

O que um time ganha, de verdade:

- **Revisão de código para de discutir sobre teste.** A lista de buracos está no PR, gerada do mesmo jeito pra todo mundo. Não é a opinião do revisor contra a do autor, é o relatório de cobertura contra o diff.
- **Teste para de ser questão de gosto.** O padrão não é a preferência de um colega que dá pra contestar, é a própria documentação da biblioteca. Isso encerra a discussão em vez de só mudar ela de lugar.
- **Quem entra no time já conhece o padrão.** Aprendeu Vitest e Playwright do mesmo jeito que todo mundo: pela documentação. Não existe dialeto interno pra aprender.
- **Teste escrito por IA para de variar.** O agente recebe a spec canônica antes de escrever a primeira linha, então o mesmo buraco produz o mesmo formato de teste hoje e no mês que vem, não importa qual modelo escreveu.
- **Código legado não é uma parede.** O redbar só olha pro que *mudou*. Um repo com 12% de cobertura não precisa chegar a 80%, precisa só não piorar. É a única regra de cobertura que alguém de fato cumpre.

### O portão, no pull request

`redbar ci` derruba o build quando o diff carrega buracos acima do limite, e `--md` escreve a mesma tabela como um comentário que o revisor de fato lê. Um portão que só imprime `FAIL` é desativado pela terceira pessoa que ele bloqueia; um portão que nomeia o símbolo faz alguém escrever o teste.

```yaml
# .github/workflows/redbar.yml
on: pull_request
permissions: { contents: read, pull-requests: write }

jobs:
  gaps:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }        # redbar diffs against the base branch
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run coverage           # whatever your runner's coverage command is
      - id: gate
        continue-on-error: true         # so the comment still lands on the run that fails
        run: npx redbar ci --base origin/${{ github.base_ref }} --md redbar.md
      - env: { GH_TOKEN: '${{ github.token }}' }
        run: |
          id=$(gh api "repos/${{ github.repository }}/issues/${{ github.event.number }}/comments" \
                --jq 'map(select(.body | startswith("<!-- redbar -->"))) | .[0].id // empty')
          [ -n "$id" ] \
            && gh api -X PATCH "repos/${{ github.repository }}/issues/comments/$id" -F body=@redbar.md \
            || gh api -X POST "repos/${{ github.repository }}/issues/${{ github.event.number }}/comments" -F body=@redbar.md
      - if: steps.gate.outcome == 'failure'
        run: exit 1
```

O comentário carrega uma marca `<!-- redbar -->`, então todo push **edita o mesmo comentário** em vez de empilhar um novo. Um pull request com onze comentários do redbar é um pull request onde ninguém lê o comentário do redbar.

Os limites são `--max-critical` (padrão `0`) e `--max-high` (padrão: ilimitado). Comece só com `--max-critical 0`: ele bloqueia só lógica de branch sem teste em código que a branch realmente tocou, a única regra que ninguém contesta.

## Status

Honestidade sobre o que existe hoje. O motor está pronto e testado em repositórios reais; as superfícies em volta dele estão sendo construídas.

| | |
|---|---|
| ✅ **Motor** | Detecção de linguagem + runner, três parsers de cobertura, cruzamento com diff, atribuição de símbolo, ranking de criticidade, classificação de camada |
| ✅ **Verificado em repos reais** | Um app React Native de produção (Jest) e o próprio redbar (Vitest). Todo bug sério nessa ferramenta foi achado assim |
| ✅ **CLI** | `redbar inspect`, `redbar briefing`, `redbar execute`, `redbar explain`, `redbar init`, `redbar ci`, `redbar mcp` |
| ✅ **Relatórios** | `.redbar/gaps.json` pro agente, um comentário markdown pro pull request, uma tabela HTML/PDF pra imprimir pro humano |
| ✅ **Portão de CI** | `redbar ci --md` derruba o build e posta a tabela de buracos no PR, editando o próprio comentário em vez de empilhar |
| ✅ **`execute`** | Entrega cada buraco pra qualquer agente de código instalado, barra o que ele escreveu, depois mede de novo. `OUTCOME.md` traz os vereditos medidos e o relato do próprio agente, nunca misturados |
| ✅ **Skills de agente** | `/redbar.inspect`, `/redbar.fix`, `/redbar.init`: o agente lê o buraco e a spec, escreve o teste, **roda ele**, e nunca deixa um vermelho pra trás |
| ✅ **Servidor MCP** | `redbar mcp`: mesmo motor, exposto pra qualquer cliente MCP |
| ✅ **Convenções** | TypeScript, Python, Java, Rust, PHP: unit, integration, e2e, cada uma rastreável até a documentação da própria biblioteca |
| 🚧 **Convenções** pra Go | As mesmas cinco perguntas, o idioma de cada ecossistema |
| 🚧 **Pool de workers do `fix`** | Modo batch pra CI: N buracos em paralelo, particionados por arquivo alvo pra dois workers nunca colidirem |

Os documentos de design estão em [`docs/superpowers/specs/`](superpowers/specs/), e os planos de implementação em [`docs/superpowers/plans/`](superpowers/plans/).

## Use com seu agente

As skills funcionam no Claude Code hoje, e seguem uma regra: **a skill nunca analisa cobertura sozinha, ela roda o motor e reporta o que voltou.** O LLM orquestra; ele não calcula.

```
/redbar.inspect          acha o que essa branch deixou sem teste
/redbar.fix               escreve os testes que faltam, roda eles, nunca deixa um vermelho
/redbar.init               propõe as bibliotecas de teste (nunca instala)
```

`/redbar.fix` é o pitch inteiro num comando só. Ele lê `.redbar/gaps.json`, lê a spec canônica daquela camada, escreve **um** arquivo de teste, **roda ele**, e se falhar duas vezes apaga o arquivo e marca o buraco como `needs-human`. Ele nunca enfraquece uma asserção pra ficar verde: um teste que não afirma nada reporta uma cobertura que não existe, exatamente a mentira que essa ferramenta foi construída pra eliminar.

As instruções de agente moram em [`AGENTS.md`](../AGENTS.md), com `CLAUDE.md` e `.github/copilot-instructions.md` apontando pra lá. Uma fonte de verdade, não cinco. **O agente carrega sozinho, ninguém instala nada.**

### `redbar execute`: o agente escreve, o redbar avalia

```bash
redbar execute            # detecta seu agente, entrega todo buraco, depois mede o que mudou
redbar execute --max 3    # só os três piores buracos
```

Ele acha qualquer agente de código instalado (`claude`, `codex`, `copilot`, `gemini`,
`cursor-agent`), entrega **um buraco de cada vez** com o padrão canônico da camada, e passa tudo que
ele escreve por quatro portões, nenhum dos quais o agente tem voto:

| Portão | Se falhar |
|---|---|
| Tocou em código de produto? | **revertido.** Um agente que "conserta" o código-fonte pra fazer o teste dele passar mudou, em silêncio, o que o seu sistema faz. |
| Escreveu mais de um arquivo de teste? | **todos apagados**, marcados `too-many-files`. A regra 1 do prompt é "exatamente um arquivo de teste": um arquivo extra sem avaliação ainda ia subir a cobertura e fechar o buraco sem nunca passar pelos próximos dois portões. |
| O teste afirma alguma coisa? | **apagado.** Um teste que não afirma nada ainda sobe a cobertura. É essa a trapaça que esse portão existe pra pegar. |
| O teste passa? (uma nova tentativa) | **apagado**, e o buraco é marcado `needs-human`. |

Antes de cada buraco rodar, o redbar tira um snapshot de quais arquivos já estão sujos e subtrai
essa base do que o agente tocou. Assim o primeiro portão nunca reverte uma edição não commitada de
um humano, e o segundo buraco nunca herda ou apaga o arquivo de teste do primeiro só porque ele
ainda está na árvore.

Depois ele **roda o comando de cobertura de novo e inspeciona de novo**. Um buraco fica `closed`
porque o relatório novo diz que aquelas linhas agora executam, não porque o agente disse. `OUTCOME.md`
mostra os vereditos medidos (`closed`, `open`, `no-assertion`, `too-many-files`, `touched-source`) e o
relato do próprio agente (`needs-human`, `timeout`, `no-output`) em dois blocos separados, e o segundo
nunca vira o primeiro.

`execute` se recusa a rodar numa working tree suja. Ele escreve e reverte arquivo, e não consegue
distinguir a própria escrita do seu trabalho não commitado. Reverter o errado não tem reflog nem
stash por trás. Ele nomeia o que está sujo e manda você commitar ou dar stash antes. Não existe
`--force`: a mesma postura do `git rebase`, pelo mesmo motivo.

## Testa: a jornada inteira em quatro comandos

Exige Node 20.11+. Fica em qualquer repo, numa branch com trabalho feito.

```bash
# 1. o que eu mudei que nada testa?
redbar inspect                 # a lista de buracos ordenada, medida, zero LLM

# 2. me dá o briefing pra entregar ao meu agente
redbar briefing                # escreve .redbar/TESTING.md + HTML + PDF

# 3. deixa meu agente escrever os testes, e avalia o resultado
redbar execute                 # detecta seu agente, barra o trabalho dele, mede de novo

# 4. prova que um número qualquer é real
redbar explain Checkout        # a linha do lcov, a linha do diff, a conta do score
```

Sem relatório de cobertura? O `inspect` roda o comando de cobertura do seu projeto por você. Só tem
teste, sem passo de cobertura configurado? Ele falha alto, com o comando exato pro **seu** runner.
jest e vitest não compartilham um, e nem maven e gradle. E nunca chuta. Sem teste nenhum? Ele para e
te aponta pro `redbar init`, que propõe as bibliotecas e não instala nada.

Trabalhando a partir do checkout do redbar em vez de uma instalação? Troca `redbar` por
`npm run try --` ou `npx tsx src/cli.ts`.

## Princípios de design

Esses princípios sustentam o projeto. Cada um é uma decisão que dá pra apontar.

- **Zero LLM na análise.** A autoridade do número vem do compilador e do git. Esse é o pitch.
- **Zero dependência de runtime.** Os parsers de cobertura são escritos na mão; a integração multi-LLM inteira é um `spawn()`. O CI derruba o build se aparecer uma dependência.
- **Ele nunca instala nada sozinho.** Editar o `package.json` ou `pom.xml` de alguém sem pedir é, na melhor das hipóteses, um PR rejeitado e, na pior, um incidente de supply chain. O `init` propõe; o humano aprova.
- **Ele nunca deixa um teste vermelho pra trás.** Um teste gerado que falha duas vezes é marcado `needs-human` e apagado. Um teste vermelho vazando numa demo apaga tudo o resto.
- **Toda diferença entre linguagens é dado.** Se aparecer um `switch (language)`, o design falhou.
- **Saída determinística.** Mesma entrada, mesma ordem, byte a byte. Um relatório que embaralha não dá pra diffar num PR, e um portão de CI construído em cima dele ficaria instável.

## Releases

Versionamento semântico, e a tag é o que publica. Não existe bot de release nem `semantic-release`
na árvore de dependências. Uma ferramenta que vende zero dependência de runtime não traz trinta
delas só pra cortar uma versão.

```bash
npm run release:patch   # 0.1.0 → 0.1.1   uma correção
npm run release:minor   # 0.1.0 → 0.2.0   uma feature, ou mudança na superfície pública
npm run release:major   # 0.1.0 → 1.0.0   uma quebra
```

Cada um atualiza o `package.json`, commita, cria a tag, e dá push na tag. O push da tag dispara o
[`release.yml`](../.github/workflows/release.yml), que **se recusa a publicar se o build não estiver
verde**: typecheck, a suíte inteira, o build, a verificação de zero dependência, e a checagem de que
a tag bate com a versão do `package.json`. Uma tag é uma promessa; não se corta de um build vermelho.

O `preversion` roda o typecheck e os testes localmente também, então um release quebrado falha na
sua máquina antes de chegar ao CI.

Enquanto a versão major for `0`, a superfície pública (as flags da CLI, o formato do `gaps.json`, o
tipo `Language` do registro) ainda pode mudar numa minor. O [`CHANGELOG.md`](../CHANGELOG.md) avisa
quando isso acontece.

## Contribuindo

A contribuição mais valiosa não é código. É **rodar o redbar num repositório real e contar pra
gente o que ele errou.**

Todo bug sério dessa ferramenta até agora foi achado assim, e nenhum deles foi pego por uma fixture
escrita na mão:

- Um app React Native revelou que **um arquivo que nenhum teste importa nunca aparece no relatório de cobertura**. Então o arquivo com zero teste ficava invisível pra ferramenta construída pra achar arquivo com zero teste. O inverso exato da promessa.
- O mesmo app revelou que React de verdade escreve `const Button = (...)` e exporta no final do arquivo, então exigir a palavra-chave `export` deixava todo componente nomeado `(no symbol)`.
- Rodar o redbar no próprio redbar revelou que uma tabela de dados estática pontuou 21 branches fantasmas: palavras-chave contadas de dentro de regex literais e comentários.

Fixture testa o que você já tinha pensado. Repositório real testa o que você não tinha.

## Licença

[MIT](../LICENSE) © Emerson Silva
