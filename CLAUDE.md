# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kinexus é um app pessoal de treino para 3 usuários fixos (sem cadastro público). Uma IA externa gera o treino, o usuário cola o texto no app, e o Kinexus interpreta, casa os exercícios com o catálogo da Garmin e passa a controlar frequência, planilha e sessões. Interface e conteúdo são em português.

## Comandos

```bash
npm run dev                 # wrangler dev (Worker + D1 local)
npm test                    # vitest run — suíte inteira
npm test -- tests/workouts  # um diretório ou arquivo só
npm run typecheck           # tsc --noEmit
npm run deploy              # wrangler deploy

npm run db:migrate:local    # aplica migrations no D1 local
npm run db:migrate:remote   # aplica no D1 de produção
npm run seed:exercises      # rebusca o catálogo da Garmin (~1700 requisições, minutos)
npm run ref:exercises       # regera docs/catalogo-garmin.md a partir do SQL do seed
```

Os testes rodam no runtime real de Workers via `@cloudflare/vitest-pool-workers`, aplicando as migrations de verdade a cada execução (`tests/setup/apply-migrations.ts`). Não há mock de D1: um teste que muda schema exige migration.

## Arquitetura

Worker único em Cloudflare + Hono com JSX renderizado **no servidor**, e D1 (SQLite) como banco. Não existe build de frontend, bundler de assets nem SPA. Todo o CSS mora em `src/views/layout.tsx` como uma string; JavaScript no cliente aparece em exatamente três scripts, como strings injetadas na página: cronômetro e checklist da sessão (`src/dashboard/routes.tsx`), busca na lista de exercícios (`src/workouts/routes.tsx`) e teclado de PIN (`src/auth/routes.tsx`), além do `confirm()` inline no botão de excluir planilha. Tudo o mais precisa funcionar sem JavaScript — por isso o detalhe do exercício é rota própria (`GET /treinos/exercicio/:id`) e não um painel de JS.

`src/index.ts` monta as rotas e aplica `requireAuth` em tudo que vem depois de `/login` e `/logout`.

Fluxo de dados: importação (`src/import/parse.ts` tenta JSON e depois lista semiestruturada) → resolução contra o catálogo (`src/exercises/match.ts`, nome exato e depois Levenshtein) → persistência (`src/workouts/repo.ts`). Uma planilha ativa por usuário; importar outra desativa a anterior.

`src/views/exercise-row.tsx` centraliza a apresentação do exercício e define os quatro estados de referência, usados tanto em Hoje quanto em Treinos: `garmin` (mídia do catálogo), `youtube` (link colado pelo usuário), `catalogo` (bate no catálogo, sem mídia) e `nenhuma` (avulso). **A prioridade importa:** o link do YouTube do usuário vence a mídia da Garmin.

## Catálogo da Garmin

O catálogo é seedado de endpoints públicos da Garmin. São quatro arquivos de índice, todos sob `connect.garmin.com/web-data/exercises/`: `Exercises.json` (força, corrida, bike, cardio, aquecimento), `Mobility.json`, `Yoga.json` e `Pilates.json`. Natação não existe em catálogo nenhum.

Três detalhes que custaram caro para descobrir:

- **O detalhe do exercício exige a categoria no caminho**: `/web-data/exercises/pt-BR/{CATEGORIA}/{CODIGO}.json`. Usar `/{CODIGO}/{CODIGO}.json` dá 404 em quase tudo.
- **Imagem e vídeo vêm de hosts diferentes.** `heroImage` é de `connect.garmin.com`; `videos[].video` e `videos[].thumbnail` são de `connectvideo.garmin.com`. O seed grava URL absoluta, e as páginas só usam o campo como vem. A Garmin permite hotlink e manda `Access-Control-Allow-Origin: *`, então o vídeo toca embutido.
- **`discipline` é multivalorada** (lista separada por vírgula, ex. `forca,mobilidade,yoga,pilates`), porque `Yoga.json` e `Pilates.json` contêm exatamente os mesmos 202 códigos. Valor único zeraria uma das duas disciplinas. Filtre com `split(',')`, não com igualdade.

Hoje o catálogo tem 1706 exercícios, 383 com imagem, 382 com vídeo e passo a passo em pt-BR.

**O gargalo de mídia não é o catálogo, é o casamento de nomes.** Os nomes que uma IA escreve naturalmente ("Ponte com faixa elástica") não são os nomes oficiais da tradução pt-BR ("Levantamento de quadril"), e a distância de Levenshtein não cobre sinônimos. Por isso existe `docs/catalogo-garmin.md`: um arquivo para mandar junto ao pedir o treino à IA, para que ela use os nomes oficiais. Ganhos de cobertura vêm de melhorar a resolução na importação, não de mexer no seed de novo.

## Armadilhas

- **Migrations são append-only.** As 0001–0006 já foram aplicadas em produção. Nunca edite uma existente; crie a próxima.
- **Recriar o catálogo quebra as planilhas.** `workout_exercises.exercise_id` referencia `exercises`, e `custom_name` fica nulo quando há match. O par 0004/0006 mostra o caminho: descer o nome para `custom_name` antes de apagar e religar por nome depois.
- **Datas são de São Paulo, não UTC.** Sempre use `src/dateBR.ts`; `new Date().getMonth()` direto dá o mês errado à noite.
- **O SQL do seed tem `INSERT` que ocupa mais de uma linha** — algumas descrições da Garmin trazem quebra de linha. Processe por instrução, não por linha (ver `scripts/generate-exercise-reference.ts`).
- **Link do YouTube passa por `httpUrlOrNull` (`src/safeUrl.ts`) em toda entrada e antes de virar `href`.** Ele vem de texto colado e do JSON oculto do `/importar/confirm`, que o cliente pode editar. O link é por linha de `workout_exercises`, ou seja, vale para um dia só. Na tela de detalhe, `youtubeEmbedUrl` o transforma em iframe do `youtube-nocookie.com`; link que não é vídeo único do YouTube fica só como link.
- Sessão aberta há mais de 5 horas fecha sozinha com `duration_counted = 0`: conta como dia treinado na frequência, mas fica fora de estatística de duração.
- `temp/` está no `.gitignore` e guarda os dados pessoais de treino e os mockups. Não mova esse conteúdo para dentro do repositório sem perguntar.

## Design da interface

`temp/mockup-kinexus.html` é o mockup aprovado e serve de especificação visual. Decisões que não devem ser desfeitas sem conversa: paleta em tokens com modo escuro (base cinza-esverdeada, ação em verde-faixa, alerta em terracota), tipografia Archivo variável usando o eixo de largura para separar título de corpo, listas em réguas horizontais com cartão elevado só para o que é acionável (não transformar tudo em cards iguais), e navegação inferior no celular que vira rail lateral a partir de 900px.

O design original do MVP está em `docs/superpowers/specs/`.
