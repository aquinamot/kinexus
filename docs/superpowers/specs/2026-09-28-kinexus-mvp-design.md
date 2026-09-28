# Kinexus — Design do MVP

**Data:** 2026-09-28
**Status:** Aprovado para planejamento de implementação

## 1. Visão geral

Kinexus é um app de personal trainer assistido por IA, rodando inteiramente no navegador via Cloudflare Workers. Uma IA (externa, ex: Claude/ChatGPT) gera o treino; o usuário cola esse conteúdo no Kinexus, que interpreta, salva e passa a controlar frequência (calendário de presença), planilhas de treino (dias A/B/C) e sessões de treino (check-in/checkout).

Produto de referência: MFIT Personal. Uso inicial: 3 usuários fixos (Bruno, Michele, Cecília), sem cadastro público.

## 2. Escopo do MVP

**Dentro do escopo:**
- Login por seleção de usuário + PIN de 4 dígitos, com "lembrar dispositivo"
- Importação de treino por colar texto (JSON estruturado ou lista semi-estruturada)
- Catálogo de exercícios seedado a partir dos dados públicos da Garmin (nomes, músculos, imagem, vídeo)
- Planilha de treino ativa por usuário, organizada em dias (A/B/C)
- Check-in/checkout de sessão de treino com cronômetro e duração
- Calendário de frequência (mês completo) por usuário
- Resolução de exercícios não reconhecidos no catálogo (sugestão por similaridade ou manter avulso)

**Fora do escopo (futuro):**
- Registro de carga/reps real executada por série (progresso de carga)
- Múltiplas planilhas simultâneas / histórico de planilhas antigas
- Edição manual de planilha pela UI (hoje só via reimportação)
- Modo de execução guiado (exercício a exercício, cronômetro de descanso por série)
- Cadastro de novos usuários pela própria aplicação
- Import via API chamada diretamente por um agente de IA (fase futura; hoje é copiar/colar)

## 3. Usuários e autenticação

- 3 usuários fixos, seedados diretamente no banco (sem tela de cadastro).
- Login: 1º acesso no dispositivo → tela de seleção de usuário → PIN de 4 dígitos. Acessos seguintes no mesmo dispositivo pulam direto para o PIN (usuário lembrado via cookie), com link "trocar usuário" para voltar à seleção.
- PIN armazenado com hash (PBKDF2/SHA-256 via Web Crypto, nativo do runtime de Workers — sem dependências nativas incompatíveis com Workers).
- Sessão de login via cookie assinado (HMAC), validado contra tabela `sessions_auth` no D1.
- Limite de tentativas de PIN incorreto (ex: bloqueio de 30s após 5 erros) para mitigar força bruta trivial.

## 4. Arquitetura

- Único **Cloudflare Worker** com **Hono** (roteamento + JSX para renderização no servidor).
- HTML renderizado no servidor a cada request; interatividade leve (PIN pad, botão de check-in/checkout, textarea de importação) com JS mínimo/htmx — sem build de SPA nem bundler de frontend separado.
- Banco: **Cloudflare D1** (SQLite gerenciado).
- Deploy via `wrangler`.
- Sem serviços externos além do próprio Worker + D1, exceto o carregamento de mídia (imagem/vídeo) hotlinkada dos servidores da Garmin e, opcionalmente, embeds do YouTube.

## 5. Modelo de dados (D1)

```
users              (id, name, pin_hash, created_at)
sessions_auth      (id, user_id, expires_at)
exercises          (id, name, muscle_group, equipment, garmin_image_url, garmin_video_url)
workout_plans      (id, user_id, name, created_at, is_active)
workout_days       (id, plan_id, label ['A'|'B'|'C'], focus_name, order)
workout_exercises  (id, workout_day_id, exercise_id NULL, custom_name NULL, sets, reps, order, youtube_url NULL)
workout_sessions   (id, user_id, workout_day_id NULL, date, started_at, ended_at NULL, duration_counted BOOL)
```

Notas:
- `exercise_id` é nulo quando o exercício importado não teve match no catálogo (fica com `custom_name` e sem mídia).
- `youtube_url` em `workout_exercises` é opcional, preenchido quando a IA sugere um vídeo específico na importação; tem prioridade sobre `garmin_video_url` do exercício ao exibir a referência.
- Uma planilha (`workout_plans`) marcada `is_active=true` por usuário; importar uma nova desativa a anterior automaticamente.
- `workout_sessions.duration_counted = false` quando a sessão foi fechada automaticamente por timeout (ver seção 8) — conta para o calendário de frequência, não conta para estatísticas de duração.

## 6. Catálogo de exercícios (seed)

Fonte: endpoints públicos (não documentados oficialmente, mas estáveis o suficiente para uso pessoal) usados pelo projeto de referência [GarminExercisesCollector](https://github.com/maximecharriere/GarminExercisesCollector):

- Lista mestra: `connect.garmin.com/web-data/exercises/Exercises.json` (categorias → exercícios → músculos primário/secundário)
- Detalhe por exercício: `connect.garmin.com/web-data/exercises/en-US/{NOME}/{NOME}.json` (nome, descrição, dificuldade, equipamento, `heroImage`, array `videos`)
- Mapeamento de equipamento: `exerciseToEquipments.json`

Decisão: **não** trazer o repositório Python nem depender da planilha Google Sheets de terceiros que ele mantém — ambos adicionariam dependências fora do stack (Python, credenciais Google) e um ponto de falha externo fora do nosso controle. Em vez disso, escrever um script de seed próprio (TypeScript, executado localmente/uma vez) que chama esses mesmos endpoints e popula a tabela `exercises` do D1 via `wrangler d1 execute`.

Pendência de implementação (não bloqueia o design): confirmar o domínio base para os caminhos relativos de imagem/vídeo retornados pela Garmin (ex: `/msn-workout/Strength/S_026-A2.mp4`) — provavelmente um subdomínio de CDN a ser identificado durante a implementação do script de seed.

## 7. Fluxo de importação de treino

1. Usuário cola o conteúdo (JSON estruturado ou lista semi-estruturada tipo `Nome do exercício: 4x8-10`) numa textarea.
2. Parser tenta primeiro `JSON.parse`; se falhar, tenta parser de lista semi-estruturada baseado em regex linha-a-linha.
3. Cada exercício extraído é comparado ao catálogo: match exato por nome primeiro, senão busca por similaridade (ex: distância de Levenshtein) sugerindo os candidatos mais próximos.
4. Tela de preview mostra: treinos/dias reconhecidos, contagem de exercícios, quais bateram com o catálogo e quais não bateram.
5. Para cada exercício não reconhecido, usuário escolhe: aceitar uma sugestão de match, ou manter como exercício avulso (`custom_name`, sem mídia).
6. Confirmação salva a planilha inteira (`workout_plans` + `workout_days` + `workout_exercises`) e desativa a planilha anterior do usuário.
7. Nada é persistido antes da confirmação explícita do preview — falhas de parsing não deixam dado parcial no banco.

## 8. Sessões de treino (check-in / checkout)

- "Iniciar treino" no dashboard cria uma `workout_session` com `started_at = now()`, associada ao `workout_day` exibido.
- Enquanto aberta, a UI mostra um cronômetro com o tempo decorrido.
- "Finalizar treino" grava `ended_at = now()` e `duration_counted = true`.
- Se uma sessão ficar aberta por **5 horas** sem checkout manual, um fechamento automático grava `ended_at` no limite e marca `duration_counted = false` — conta como dia treinado no calendário, mas a duração não entra em nenhuma estatística de tempo.
- Se o usuário tentar iniciar um treino com uma sessão já aberta, a sessão existente é reaberta na tela em vez de criar uma nova.
- Histórico simples de sessões (data, treino, duração ou "não contabilizado").

## 9. Frequência / Dashboard

- Tela principal pós-login: calendário do mês completo (grade 7 colunas) derivado de `workout_sessions` (uma marcação por dia com pelo menos uma sessão), mais card do "treino de hoje" com a lista de exercícios do próximo dia da rotação A/B/C.
- Definição de "próximo dia": a `workout_session` mais recente do usuário indica o último `workout_day` treinado; o card mostra o próximo `label` na ordem definida em `workout_days.order` (voltando ao primeiro após o último). Sem nenhuma sessão registrada ainda, mostra o primeiro dia da planilha ativa.
- Sem tabela ou tela dedicada de "progresso" no MVP — o calendário de frequência já cobre a necessidade (progresso = adesão, não evolução de carga).

## 10. Tratamento de erros

- Importação: conteúdo não reconhecido (nem JSON nem lista) → mensagem pedindo para colar novamente; nenhuma escrita parcial no banco.
- PIN incorreto: mensagem genérica (não revela se o usuário existe); bloqueio temporário após tentativas repetidas.
- Mídia externa (Garmin/YouTube) indisponível: placeholder "vídeo indisponível" em vez de quebrar a tela.
- Sessão de treino já aberta: reabrir em vez de duplicar.

## 11. Testes

- Unitários: parser de importação (JSON e lista semi-estruturada), matching por similaridade contra o catálogo, hash/verificação de PIN, expiração de sessão de login.
- Rota (via Miniflare/Vitest simulando o runtime de Workers): login completo, importação completa (colar → preview → confirmar), iniciar/finalizar sessão de treino, fechamento automático após 5h.

## 12. Deploy e custo

- Único Worker + D1, deploy via `wrangler deploy`.
- Uso projetado (3 usuários) cabe integralmente no plano gratuito da Cloudflare Workers + D1 (ver limites verificados: 100k requests/dia, 5M linhas lidas/dia, 100k linhas escritas/dia, 5GB de storage). Custo esperado: **$0/mês**.
