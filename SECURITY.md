# Política de segurança

## Superfície

O redbar tem **zero dependências de runtime** — de propósito. Uma revisão de segurança do redbar é
uma revisão do redbar, não de uma árvore de terceiros. O código que roda na sua máquina é o que está
em `src/`, e nada mais.

O `redbar mcp` fala JSON-RPC no stdin/stdout e não abre porta de rede. Só o `redbar execute` chama um
modelo, e ele se recusa a rodar numa árvore de trabalho suja.

## Reportando uma vulnerabilidade

Não abra uma issue pública para vulnerabilidades. Use os
[Security Advisories privados do GitHub](https://github.com/emersonjds/redbar/security/advisories/new)
ou contate **[@emersonjds](https://github.com/emersonjds)** diretamente.

Diga o que encontrou, como reproduzir, e o impacto que você enxerga. Respondemos o mais rápido que
der, e creditamos quem reportar, se você quiser.

## Versões suportadas

O redbar ainda é pré-1.0: as correções vão para a última versão publicada.
