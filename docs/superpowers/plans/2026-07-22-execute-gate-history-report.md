# Execute gate + histórico + porquê no relatório — Plano de implementação

> **For agentic workers:** implementar task-by-task, TDD, micro-commits. Steps com checkbox.

**Goal:** `execute` corta por banda e pede autorização mostrando o porquê medido; runs viram histórico datado com `compare`; o relatório expõe o porquê medido por gap.

**Architecture:** funções puras testáveis (filtro por banda, parse de flag, decisão de autorização, diff de runs, render do plano/trend) + a I/O (readline, symlink, disco) presa nos comandos em `cli.ts`. Nada de LLM em número, texto ou decisão. Deriva de `docs/superpowers/specs/2026-07-22-execute-gate-and-run-history-design.md`.

**Tech Stack:** TypeScript, vitest, zero dep nova (`node:readline` já usado em mcp.ts).

## Global Constraints

- Zero-LLM em qualquer número/texto/decisão medida. O "porquê" é `bandReason`/`scoreArithmetic`, byte-idêntico.
- `executeGaps`/`attemptGap` (os 3 gates, 7 veredictos) NÃO mudam.
- MCP não muda (sem `redbar_execute`).
- Determinismo: só o nome da pasta de run e `summary.date` tocam o relógio; nunca um score/band/linha.
- Commits: autor Emerson, sem `Co-Authored-By`, sem 🤖, sem menção a IA. Conventional, minúsculo, sem ponto final.

---

## Plano A — execute: gate por banda + autorização + ruído

### Task A1: ruído no registry (`languages.ts`)
**Files:** Modify `src/languages.ts:331` · Test `test/languages.test.ts`
- [ ] Teste: o `testFilePattern` do TS casa `src/features/x/mocks/handlers.ts` e `src/routeTree.gen.ts` (são excluídos), e NÃO casa `src/mocks-helper.ts` nem `src/gen.ts`.
- [ ] Rodar → falha.
- [ ] Adicionar `mocks` à alternância de segmentos e `\.gen\.[jt]sx?$`, com comentário "achado num repo real".
- [ ] Rodar → passa. Commit: `feat(languages): exclui mocks/ e *.gen.ts do gap (ruído de repo real)`.

### Task A2: filtro por banda (`severity.ts`)
**Files:** Modify `src/severity.ts` · Test `test/severity.test.ts`
- [ ] Teste: `meetsSeverity(criticalGap,'high')===true`, `meetsSeverity(lowGap,'critical')===false`, `meetsSeverity(highGap,'high')===true`.
- [ ] `export function meetsSeverity(gap, threshold: Severity): boolean` = `RANK[severity(gap)] <= RANK[threshold]`.
- [ ] Passa. Commit: `feat(severity): meetsSeverity — banda como filtro`.

### Task A3: parse de --severity + decisão de autorização (`cli.ts`, puro)
**Files:** Modify `src/cli.ts` · Test `test/cli.test.ts`
- [ ] Teste `parseSeverityThreshold`: `undefined→'critical'`, `'high'→'high'`, `'all'→'all'`, inválido lança.
- [ ] Teste `authorizationOutcome`: `{yes:true}→'proceed'`, `{yes:false,isTTY:true}→'ask'`, `{yes:false,isTTY:false}→'stop'`.
- [ ] Implementar as duas funções puras exportadas. Passa. Commit: `feat(execute): parse de --severity e decisão de autorização`.

### Task A4: render do plano de autorização (`cli.ts`/`explain.ts`, puro)
**Files:** Modify `src/explain.ts` (export `bandReason`) + `src/cli.ts` · Test `test/cli.test.ts`
- [ ] Teste `renderExecutePlan(gaps)`: contém símbolo, banda, `scoreArithmetic`, `bandReason`; não contém texto gerado.
- [ ] `export`ar `bandReason`; implementar `renderExecutePlan`. Passa. Commit: `feat(execute): plano de autorização com o porquê medido`.

### Task A5: fiar tudo em `runExecute` (efeitos)
**Files:** Modify `src/cli.ts` (`runExecute`, `main` async, HELP)
- [ ] Filtrar `before.gaps` por `meetsSeverity(threshold)` (quando ≠ 'all') antes do `slice(max)`; mensagem se vazio.
- [ ] Imprimir `renderExecutePlan`; `authorizationOutcome` → proceed / `confirm()` readline y/N / stop (imprime "re-rode com --yes" e sai).
- [ ] `runExecute` vira async; `main` async awaita o case execute; `--severity`/`--yes` no parseArgs e no HELP.
- [ ] `npm run typecheck && npx vitest run test/cli.test.ts`. Commit: `feat(execute): gate por banda e autorização antes do agente`.

---

## Plano B — histórico + compare

### Task B1: `.redbar/` no gitignore
**Files:** Modify `.gitignore`
- [ ] Se `.redbar/` não estiver, adicionar. Commit: `chore(git): ignora .redbar/ (artefatos e histórico de runs)`.

### Task B2: run datado + summary (`cli.ts`)
**Files:** Modify `src/cli.ts` (`runBriefing`, `runExecute`) · Test `test/cli.test.ts`
- [ ] Teste `runDirName(new Date('2026-07-22T21:55:30Z'))==='2026-07-22T21-55-30'` e `bandCounts(gaps)` = contagens por banda.
- [ ] Implementar `runDirName` (puro) e `bandCounts` (puro, reusa `severity`).
- [ ] `runBriefing`: escreve `TESTING.md/REDBAR.html/REDBAR.pdf/gaps.json/summary.json` em `.redbar/runs/<ts>/`, atualiza symlink `.redbar/latest`. `inspect` segue escrevendo `.redbar/gaps.json` (handoff das skills, intacto).
- [ ] `runExecute`: OUTCOME.* também no run dir. Typecheck+test. Commit: `feat(history): runs datados em .redbar/runs/<ts>/ + latest`.

### Task B3: diff puro de runs (`compare.ts`, novo)
**Files:** Create `src/compare.ts` · Test `test/compare.test.ts`
- [ ] Teste: identidade `(file,symbol)` — gap presente em A ausente em B = `closed`; só em B = `added`; delta por banda; linha diferente NÃO conta como reaberto.
- [ ] `export function compareRuns(a: Gap[], b: Gap[]): {closed, added, deltaByBand}`. Passa. Commit: `feat(compare): diff de dois runs por (file,symbol)`.

### Task B4: comando `compare` + TREND (`cli.ts`)
**Files:** Modify `src/cli.ts` (novo `runCompare`, `canonical`, HELP, switch) · Test `test/cli.test.ts`
- [ ] Teste `canonical` não quebra; `compare` no switch.
- [ ] `runCompare`: latest vs anterior, ou duas datas; lê os `gaps.json` dos run dirs; `compareRuns`; imprime; `renderTrendHtml`→`htmlToPdf` `TREND.pdf`.
- [ ] Typecheck+test. Commit: `feat(compare): comando redbar compare + TREND.pdf`.

---

## Plano C — porquê medido no relatório

### Task C1: `<details>` com o porquê medido em `renderHtml`
**Files:** Modify `src/report.ts` (`renderHtml`) · Test `test/report.test.ts`
- [ ] Teste: o HTML de um gap contém `scoreArithmetic(gap)` e `bandReason(gap)` dentro de um `<details>`.
- [ ] Por linha do ranking, adicionar `<details>` com banda, linhas descobertas, `scoreArithmetic`, `bandReason` (reusa `explain.ts`). Terminal/PDF: mesma informação; no PDF o details fica aberto.
- [ ] Typecheck+test. Commit: `feat(report): porquê medido por gap, expansível no html`.

---

## Self-review
- Cobertura da spec: A=decisões 1/2/3; B=4/5; C=7; MCP(6) e formulas(gap/severity) intocados por design. ✔
- Sem placeholder. ✔
- Nomes consistentes: `meetsSeverity`, `parseSeverityThreshold`, `authorizationOutcome`, `renderExecutePlan`, `runDirName`, `bandCounts`, `compareRuns`, `renderTrendHtml`. ✔
