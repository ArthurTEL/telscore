# TEL.SCORE

Placar ao vivo, central do jogo e análise de desempenho no futebol, com gerador de posts para criadores de conteúdo.

**Site:** [www.telscore.com.br](https://www.telscore.com.br)

## Endereço

- Domínio próprio `telscore.com.br`, registrado no Registro.br e apontado para a Vercel.
- `www.telscore.com.br` é o endereço principal; `telscore.com.br` redireciona para ele.
- `telscore.vercel.app` continua funcionando como endereço reserva.
- DNS no Registro.br (modo avançado): registro A `@` → `216.198.79.1` e CNAME `www` → endereço `vercel-dns` indicado pela Vercel.
- Para instalar como app: abra o endereço no celular e use "Adicionar à tela de início".

## Como funciona

```
Navegador  →  /api/football (função na Vercel, guarda a chave)  →  API-Football
                      ↑
               cache da Vercel: todos os visitantes compartilham a mesma resposta
```

- `index.html`: o site inteiro (visual, telas e lógica).
- `api/football.js`: função de servidor que chama a API-Football com a chave secreta e devolve só os dados necessários.
- `api/logo.js`: entrega escudos dos times, fotos dos jogadores e fotos dos estádios. As fotos dos jogadores aparecem nas escalações (lista e campo), na escalação provável, nos desfalques, na tabela de jogadores e na análise tática dos jogos atuais (servidor de mídia da API-Football) pelo endereço do próprio site, para que apareçam nos posts e nas imagens baixadas.
- `api/statsbomb.js`: função de servidor que lê os dados abertos da StatsBomb e transforma os eventos de um jogo (passes, chutes, pressões) em análise tática compacta. Não precisa de chave.

Se a função não responder (site aberto direto do computador, chave ausente ou erro na API), o site entra sozinho em **modo demonstração** e mostra o motivo no topo da página.

## O que já usa dados reais

| Seção | Fonte |
|---|---|
| Partidas (hoje, dias anteriores e próximos) | API-Football |
| Central do jogo: placar, lance a lance, escalações, estatísticas, notas dos jogadores, árbitro | API-Football |
| Pré-jogo (jogos futuros): probabilidades da análise de mercado (sem margem; o modelo estatístico da API aparece só como referência), escalação provável (última escalação + desfalques), estatísticas da temporada, confronto direto | API-Football (odds, predictions, injuries) |
| Ligas: classificação dos campeonatos; Champions, Europa League, Libertadores e Sul-Americana com fase de liga/grupos e chaveamento do mata-mata | API-Football |
| Análise tática · jogos atuais (hoje e ontem): linha do tempo, comparativo, destaques, força por setor, radar | API-Football |
| Análise tática · arquivo histórico: xG por chute, mapa de finalizações, rede de passes, mapa de calor, radar, PPDA, field tilt | StatsBomb Open Data |
| Estúdio de posts: 31 formatos de pós-jogo e 9 de pré-jogo × 7 plataformas × 5 tons; cada slide traz um gráfico (barras comparativas, número em destaque, card do jogador, linha do tempo dos gols, percentil, funil de ataque, forma recente, escalação), com jogos atuais (últimos 7 dias) e arquivo histórico | API-Football e StatsBomb Open Data |
| Vídeo animado (Reels, TikTok, Stories): cenas com placar, número do jogo, estatísticas em barras, linha do tempo dos gols, jogador em destaque e análise; prévia com play, pausa, barra de tempo e escolha de cenas; baixa em MP4 (ou WebM em navegadores sem MP4) | Mesmos dados do post, gravado no próprio navegador |
| Estúdio · pré-jogo (jogos dos próximos 7 dias): prévia, palpite, escalação provável, desfalques, retrospecto, momento dos times, raio-x da temporada, ficha do jogo e enquete, em todas as plataformas, inclusive vídeo animado | API-Football (predictions, injuries, última escalação) |
| Visual dos posts: foto do estádio na capa, ilustrações de futebol próprias em cada slide (campo, rede, prancheta, bola, refletores), foto do jogador ou escudo do time citado no slide e foto de capa própria opcional | API-Football (estádios, escudos, fotos) e ilustrações do próprio site |

## Análise TEL.SCORE

Nos jogos que ainda vão acontecer, a prévia mostra um cálculo único da TEL.SCORE que junta: análise de mercado, xG dos últimos 5 jogos, forma recente, campanha na temporada, titulares lesionados ou suspensos, força do elenco (nível estimado da liga, tabela `LG_TIER` no `index.html`, e posição na tabela) e mando de campo. O resultado aparece na aba Prévia da Central e no formato "Análise TEL.SCORE" do Estúdio. Sem odds disponíveis, o cálculo usa só os dados.

## Contexto do jogo (análises coerentes)

Antes de escrever qualquer texto, o site monta o contexto da partida e todas as análises partem dele:

- **Competição e fase:** liga, copa, continental ou seleções; rodada, fase de grupos ou mata-mata; final.
- **Força dos times:** posição e zona na tabela (líder, G4, rebaixamento) e, nas copas e competições continentais, o nível da liga de cada clube.
- **Expectativa:** quem era favorito antes do jogo (pelo mercado; sem odds, pela campanha na tabela ou pelo nível das ligas) e se o resultado confirmou, foi surpresa ou zebra.
- **Como o jogo foi:** virada, goleada, gol no fim, empate buscado, decisão por pênaltis e expulsões (com o minuto, porque jogar 30 minutos com um a menos muda a leitura).
- **Desempenho x placar:** quem criou mais (xG ou finalizações), com limites para não chamar de "domínio" uma diferença pequena.
- **Ao vivo:** os textos ficam no presente e falam em "até aqui", sem afirmar quem venceu.

Esse contexto aparece nos posts do Estúdio, na Prévia (pré-jogo) e no card "Leitura TEL.SCORE", na aba Estatísticas da Central do jogo.

## Escalação provável

Enquanto a escalação oficial não sai, o site monta a provável assim:

1. **Base na mesma competição:** usa a última escalação do time **na competição do jogo**. Se o Vasco pega o Boca pela Sul-Americana, vale a última escalação do Vasco na Sul-Americana, e não a do Brasileirão. Só quando o time ainda não jogou aquela competição na temporada é que vale a última partida de qualquer competição (e o site avisa).
2. **Desfalques aplicados:** quem está fora (lesão ou suspensão, pela lista da API) sai do time. No lugar entra o jogador da mesma posição que mais foi titular nos últimos jogos, com peso maior para os jogos da mesma competição; se não houver, o reserva que mais jogou na partida-base.
3. **Dúvidas:** jogadores com status de dúvida continuam na escalação, mas aparecem destacados.

A Central do jogo (aba Escalação provável) e o post "Escalação provável" do Estúdio mostram a base usada, as trocas feitas e as dúvidas.

## Tabela ao vivo

Na página Ligas, quando há jogos da liga em andamento, a classificação aplica os placares ao vivo: soma pontos e gols, reordena a tabela, mostra o placar e o minuto ao lado de cada time e setas (▲/▼) para quem sobe ou desce. As cores das zonas acompanham a posição. A tabela se atualiza sozinha junto com os jogos (vale também para a fase de liga da Champions e os grupos da Libertadores e Sul-Americana).

## Modelo de gols (pré-jogo)

A tendência de gols não é mais fixa. O site cruza o ataque de cada time com a defesa do adversário (xG recente, gols da temporada e gols dos últimos jogos), ajusta pelo mando e pelo nível das ligas e calcula: gols esperados no jogo, chance de mais de 1,5 e de mais de 2,5 gols e chance de os dois marcarem. A tendência só diz "mais" ou "menos de 2,5" quando a chance passa de 58% ou fica abaixo de 42%; no meio disso, aparece "jogo no limite dos 2,5 gols".

Quando um time não tem xG oficial nos últimos jogos, o site estima pelos chutes; sem estatísticas, estima pelos gols, e avisa embaixo do card qual estimativa usou (antes aparecia 0,00).

## Relatório de scout

O formato "Relatório de scout" mostra, em slides visuais: a ficha do jogador (foto, nota, minutos, função e clube), os 3 pontos fortes em barras de percentil, os 2 pontos de atenção, o volume de jogo (passes, passes-chave, ações defensivas e duelos) e a recomendação com a nota. Na comparação de força do elenco entre ligas diferentes, o post diz qual liga é mais forte pelo nível estimado e por quantos pontos.

## Vídeo animado

No Estúdio, a plataforma "Vídeo animado" gera um vídeo vertical (1080×1920) para Reels, TikTok e Stories. As cenas de análise não usam texto corrido: cada uma tem uma etiqueta com o tema, o visual do post (comparativo, barras, card do jogador, probabilidades, sequência V/E/D) e no máximo 3 fichas curtas que entram uma por vez, com os números em vermelho. O texto completo fica na legenda do vídeo.

## Linguagem dos posts

Nos posts não aparecem as palavras "mercado", "aposta" ou "casas de apostas". As probabilidades aparecem sempre como **análise TEL.SCORE** (que, por dentro, considera mercado, xG, forma, desfalques e força do elenco). No site, fora dos posts, o card da Análise TEL.SCORE pode citar a "análise de mercado" como um dos fatores. As capas mostram só o confronto (ex.: "Real Madrid x Barcelona"), sem o nome do formato.

## Visual dos posts

- **Identidade:** todo slide tem no topo o logo e o nome TEL.SCORE, e a capa fecha com uma faixa vermelha da marca.
- **Capa:** marca no topo com a liga e a data, escudos com placar ou horário, etiqueta com a fase e o formato, título e o número principal em destaque.
- **Slides:** título curto em vermelho, o visual (comparativo, barras, tabela, card do jogador) e, embaixo, o texto em fichas: uma informação por linha, com etiqueta vermelha quando existe ("Pontaria", "Contra a expectativa", "Local") ou marcador, e números em vermelho. No máximo 3 linhas por slide; o texto completo fica na legenda do post.

## Posts das tabelas de classificação

No Estúdio, a fonte "Tabelas" gera posts a partir da classificação de cada liga (também dá para abrir pelo botão "Gerar post da tabela", na página Ligas). Escolha a liga, o formato, a plataforma e o tom:

- **Classificação:** a tabela inteira em slides, com escudos e as cores das zonas.
- **Briga pelo título:** líder x vice, top 5, momento dos líderes e projeção no ritmo atual.
- **Corrida pelas vagas:** a linha de corte de cada zona (Libertadores, Sul-Americana, Champions, acesso...).
- **Luta contra o rebaixamento:** quem está no Z4, a distância para sair e quem está reagindo.
- **Quem está embalado:** melhores e piores sequências nos últimos 5 jogos.
- **Ataque e defesa**, **Em casa e fora** e **Projeção de pontos**.
- **Resumo da rodada** e **Próxima rodada:** resultados e jogos com a posição de cada time, destacando o jogo da rodada.
- **Raio-x do time na tabela:** escolha o time no campo "Foco".
- **Enquete:** quem é campeão, quem escapa da queda.

Cada post usa 2 consultas à API (classificação e jogos da temporada), guardadas por até 1 hora. O vídeo animado não está disponível para tabelas; as outras plataformas funcionam normalmente.

## Tabelas das ligas

A classificação marca as zonas de cada liga com a descrição oficial que vem da API-Football: Libertadores, Pré-Libertadores, Sul-Americana, Champions, Europa League, Conference League, acesso, playoff e rebaixamento. A cor aparece na posição e na faixa à esquerda da linha, e a legenda embaixo mostra só as zonas daquela tabela. No celular a tabela fica resumida (posição, clube, jogos, saldo e pontos).

## Revisão de texto

Todo texto do site passa por um revisor automático: plural certo ("1 gol", "3 gols", em vez de "gol(s)"), artigo feminino para seleções como Argentina e Itália ("a Argentina", "da Argentina"), nomes de times corrigidos (ex.: "Vasco da Gama", "São Paulo") e país do árbitro em português.

## Celular

O site é pensado primeiro para o celular (é por onde chega quem vem do Instagram e do TikTok):

- Barra fixa embaixo (Jogos, Central, Ligas, Análise, Estúdio) e cabeçalho compacto.
- Listas que rolam para o lado (dias, abas, filtros) já abrem mostrando o item ativo, com um degradê na borda indicando que há mais opções.
- Placar da Central ajustado para nomes longos e telas pequenas (até 360 px).
- Escalações: o campinho aparece primeiro, depois as listas.
- Tabelas largas (jogadores, análise tática) rolam para o lado com a coluna do jogador fixa.
- No Estúdio, ao escolher um formato a tela desce até a prévia do post.
- **Atualizar:** botão ⟳ no canto de cima (no celular e no computador) e **puxar para baixo** no topo de qualquer tela. Atualiza jogos, placares, tabelas e páginas sem recarregar o site. Se houver versão nova da TEL.SCORE publicada, o botão recarrega o site sozinho, e ao voltar para o app aparece o aviso "Nova versão disponível" (não precisa mais de Ctrl+F5).
- **Barra de baixo:** Jogos, Ligas, Central, Estúdio e **Mais**. O "Mais" abre um painel com Análise tática, Central do jogo, Tabelas, Estúdio, atalhos para a página de cada liga (com escudo), o tema dia/noite e o botão de atualizar.
- **Topo fixo e limpo no celular:** logo e botão de atualizar sempre à vista; o tema foi para o "Mais" e a faixa de placares do topo some no celular (os jogos já estão na página Jogos). As abas da Central, do time e da liga ficam fixas logo abaixo do topo.
- **Modo compacto (telas até 720 px), no estilo dos apps de placar:**
  - Na página de Partidas a lista de jogos vem primeiro; o jogo em destaque e o Radar do dia vão para baixo.
  - Linhas de jogo baixas, com escudos pequenos e sem estádio e árbitro (eles aparecem na central).
  - Títulos menores, sem o texto de apresentação, e blocos com menos espaço em volta.
  - Abas da Central do jogo e da página do time ficam fixas no topo ao rolar.
  - Placar, lance a lance, análise, tabelas, elenco com fontes e espaçamentos reduzidos.
- **Dias da página Jogos:** a fileira mostra duas semanas para trás e duas para a frente, com o nome do mês na virada. O botão **Data** (calendário) abre qualquer dia, passado ou futuro (por exemplo, 10 de julho). Em datas distantes aparece o botão **Voltar · hoje**. "Hoje", "Ontem" e "Amanhã" cabem na bolinha mesmo em telas pequenas.
- **Classificação no celular:** a tabela mostra todas as colunas do computador (J, V, E, D, GP, GC, SG, Pts, xG, xGC, ±xPts e últimos 5) e é só **arrastar para o lado**. A posição e o clube ficam fixos. Um aviso "Arraste a tabela para o lado" aparece até a primeira vez que a pessoa arrastar.
- **Jogadores na Central:** o nome tem espaço próprio e nunca passa por cima da posição; nomes compridos terminam em "…", e quem entrou durante o jogo aparece com "entrou no jogo" embaixo do nome. A coluna do jogador fica fixa ao arrastar a tabela.

## Tema dia e noite

No topo do site há três botões: dia, noite e automático (segue o tema do celular ou computador). A escolha fica salva no navegador de cada visitante.

## Configuração na Vercel

1. Em **Settings → Environment Variables** do projeto, crie:
   - `API_FOOTBALL_KEY` = sua chave (painel da API-Football → My Access).
   - Opcional: `CACHE_LIVE_SECONDS` = de quantos em quantos segundos o placar ao vivo é buscado de novo. Padrão: `120`. Com o plano pago, pode baixar para `30`.
   - `SUPABASE_URL` = endereço do projeto no Supabase (`https://xxxx.supabase.co`).
   - `SUPABASE_SECRET_KEY` = chave secreta do Supabase (`sb_secret_...`, em Settings → API Keys). Fica só no servidor.
   - `CRON_SECRET` = uma senha longa inventada por você. A Vercel manda essa senha quando roda a conferência agendada.
   - `POSTS_SENHA` = a senha que você digita no Estúdio para ligar os posts na nuvem (use uma senha longa, só sua).
   - `LOGIN_ATIVO` = `sim` para exigir a entrada por código antes do site (só depois de configurar o envio de e-mails; veja "Contas, favoritos e busca").
   - `FCM_WEB_CONFIG`, `FCM_VAPID_KEY` e `FCM_SA` = notificações (veja "Notificações, app instalável e privacidade").
   - `REVISAO_EMAIL` e `REVISAO_CODIGO` = conta para os revisores da Apple e do Google entrarem no app (só esse e-mail entra com esse código fixo de 6 dígitos, sem e-mail de verdade). Deixe sempre ligadas: cada versão nova do app passa por revisão de novo.
   - Opcional: `COLETA_MAX` (padrão `15`) = máximo de requisições da API por coleta; `COLETA_RESERVA` (padrão `35`) = requisições do dia que ficam guardadas para o site.
2. Faça um novo deploy (**Deployments → ⋯ → Redeploy**). Variáveis novas só valem depois de um deploy.

## Placar de acertos (retirado do site)

O placar de acertos saiu da tela em 25/10/2026: o card da página de Partidas, a página `/#acertos`, o atalho no menu Mais, o link na prévia e a linha na página do time. O site também parou de registrar as análises novas. Quem abrir um link antigo com `#acertos` cai na página de Partidas.

O que já estava guardado continua no Supabase (tabela `previsoes`), e `api/acertos.js` segue no projeto, sem uso pela tela. Os dois crons de conferência em `vercel.json` só conferem o que ainda estava pendente e depois não fazem mais nada; se quiser, dá para apagá-los.

## Banco de jogos (partes 2 e 3)

- Tabela `jogos` no Supabase, criada com `supabase/02_jogos_arbitros_posts.sql`. Guarda todo jogo encerrado das ligas acompanhadas com placar, xG (oficial ou estimado pelos chutes), finalizações, posse, escanteios, faltas, cartões, pênaltis, VAR e árbitro.
- A coleta (`api/banco.js?acao=coletar`) roda sozinha 5 vezes por dia (01h15, 05h15, 10h15, 16h15 e 20h15 de Brasília): completa a temporada atual de cada liga e, depois, a temporada anterior das ligas principais. Busca 20 jogos por requisição, usa no máximo 70 requisições por vez no plano Pro (15 no grátis) e nunca deixa o dia com menos de 1.500 requisições para o site (35 no grátis).
- **Para o banco não crescer demais:** as ligas da segunda prateleira (Portugal, Holanda, Argentina, Colômbia, Conference League e as segundas divisões) guardam só a temporada atual, e a Conference League não guarda as fases qualificatórias. Cada jogo ocupa uns 2 KB; com as 22 ligas o banco fica na casa de 20 a 30 MB por ano, bem longe do limite de 500 MB do Supabase grátis. O total aparece em `total_jogos` no resumo.
- Jogo que acabou de terminar e ainda não tem estatísticas na API é buscado de novo na coleta seguinte.
- O que o site ganha:
  - **Tabela das ligas:** colunas xG e xGC (por jogo) e ±xPts (pontos reais menos os pontos que o xG daria), gráfico "Pontos − xPts" e novas leituras ("soma mais do que joga"). No celular, a tabela mostra tudo e é só arrastar para o lado.
  - **Análise TEL.SCORE:** usa o xG da temporada inteira junto com o dos últimos 5 jogos, e mostra os dois lado a lado.
  - **Temporada (Central do jogo):** card "xG na temporada", com casa e fora e xPts.
  - **Arbitragem:** perfil do árbitro em todas as competições guardadas: amarelos, vermelhos, faltas e pênaltis por jogo, e resultados.
  - **Confronto direto:** médias de xG, finalizações, posse, escanteios e cartões nos confrontos guardados.
- Progresso da coleta: abra `https://www.telscore.com.br/api/banco?acao=resumo` (jogos guardados por liga e, em `ultima_coleta`, o resultado da última coleta: quando rodou, quantas requisições usou, quantos jogos salvou e, se deu errado, o erro).
- A coleta trabalha no máximo uns 40 segundos por vez e continua de onde parou na próxima.

## Contas, favoritos e busca (parte 5)

- **Entrada por código no e-mail (sem senha):** a pessoa digita o e-mail, recebe um código de 6 dígitos e entra. A sessão fica salva no aparelho (renova sozinha); os favoritos ficam no Supabase e aparecem em qualquer aparelho.
- **Primeiro acesso:** depois do código, escolhe as ligas e os times favoritos (busca pelo nome ou lista de cada liga).
- **Jogos:** a página abre com **Seus times** no topo, depois as **ligas favoritas**; os outros jogos ficam recolhidos no botão **Ver todos os jogos do dia**. Escolhendo uma liga nos filtros, aparece tudo daquela liga.
- **Seguir:** botão **☆ Seguir** na página de cada time e de cada liga. A Central do jogo abre de preferência num jogo dos favoritos.
- **Minha conta** (menu Mais): e-mail, atalhos para os times favoritos, **Editar favoritos** e **Sair**.
- **Busca** (lupa no topo): times (inclusive de outras ligas, pela API), ligas e jogos de ontem até daqui a 5 dias. A estrela ao lado do time favorita na hora.
- **Login obrigatório:** só liga com a variável `LOGIN_ATIVO=sim` na Vercel. Sem ela, o site funciona aberto e o login fica no menu Mais (para testar antes de travar o site).
- Arquivos: `api/conta.js` (login e favoritos), `supabase/03_contas_favoritos.sql` (tabela `perfis`), `supabase/email_codigo.html` (modelo do e-mail).

### Como ligar (passo a passo)

1. **Tabela:** Supabase → SQL Editor → New query → cole `supabase/03_contas_favoritos.sql` → Run.
2. **Envio de e-mails (Resend, grátis até 3.000 por mês e 100 por dia):** o envio padrão do Supabase só manda e-mail para os membros da equipe do projeto, por isso é preciso um serviço de e-mail.
   1. Crie a conta em resend.com → **Domains → Add domain** → `telscore.com.br`.
   2. O Resend mostra alguns registros DNS (TXT e MX). Cadastre-os onde o DNS do domínio é administrado (na Vercel: Domains → telscore.com.br → DNS Records; ou no Registro.br) e espere ficar **Verified**.
   3. **API Keys → Create API key** (acesso de envio). Copie a chave e guarde: ela vai só no Supabase, nunca no chat ou no GitHub.
3. **Supabase → Authentication → Emails → SMTP Settings:** ative o SMTP personalizado com:
   - Sender email: `nao-responda@telscore.com.br` · Sender name: `TEL.SCORE`
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: a chave do Resend
4. **Supabase → Authentication → Emails → Templates:** em **Magic Link** e em **Confirm signup**, troque o assunto para `Seu código de acesso à TEL.SCORE` e cole o conteúdo de `supabase/email_codigo.html` (ele usa `{{ .Token }}`, que é o código).
5. **Supabase → Authentication → Rate Limits:** suba "emails sent per hour" para 60 ou mais (o padrão com SMTP próprio é 30).
6. **Teste:** depois do deploy, abra o site → Mais → **Entrar** → seu e-mail → digite o código → escolha os favoritos.
7. **Travar o site:** com o teste funcionando, Vercel → Settings → Environment Variables → `LOGIN_ATIVO` = `sim` → Redeploy. A partir daí, quem não entrou vê a tela de entrada antes do site.

## Notificações, app instalável e privacidade (parte 6)

- **Avisos dos jogos:** gol (com o nome do jogador, minuto e placar), VAR (gol anulado e o motivo, gol confirmado, pênalti confirmado ou cancelado, cartão revisado), cartão vermelho, pênalti perdido, escalação confirmada, 30 minutos antes, início, intervalo, fim (com pênaltis quando houver), e, para quem quiser, cartão amarelo e substituições.
- **Cada pessoa escolhe:** depois dos times favoritos, o primeiro acesso tem um 5º passo, **Avisos**, com um botão para cada tipo e a opção "Também os jogos das minhas ligas". Para mudar depois: **Mais → Notificações**.
- **Onde chegam:** no app de Android e de iPhone, no navegador do computador e no Android pelo Chrome. No iPhone pelo navegador só chegam com o site adicionado à Tela de Início (regra da Apple); o app resolve isso.
- **Como funciona:** a cada minuto o Supabase chama `/api/avisos?acao=vigiar`. Se ninguém ligou os avisos, ele não gasta nenhuma requisição da API-Football. Com gente seguindo jogos, gasta a lista do dia a cada 30 minutos e 1 requisição por minuto para cada 20 jogos em andamento dos times seguidos. O gol espera até 2 minutos para chegar já com o nome de quem marcou.
- **App instalável (PWA):** `manifest.webmanifest`, ícones em `icons/` e `sw.js` (tela de "sem internet" e notificações). No menu Mais aparece **Instalar o app** quando dá para instalar.
- **Privacidade e exclusão de conta:** página `/privacidade` (link no rodapé e no menu Mais) e **Mais → Excluir minha conta**, que apaga e-mail, favoritos, escolhas e aparelhos na hora. A Apple e o Google exigem as duas coisas para aprovar o app.
- Arquivos: `api/avisos.js` (vigia), `api/_fcm.js` (envio pelo Firebase), `api/conta.js` (aparelhos, teste e exclusão), `supabase/05_notificacoes.sql`, `supabase/06_vigia_cron.sql`, `sw.js`, `manifest.webmanifest`, `icons/`, `privacidade.html`.

### Como ligar as notificações (passo a passo)

1. **Firebase (grátis):** console.firebase.google.com → **Criar projeto** → nome `telscore` (o Google Analytics pode ficar desligado).
2. **Configuração do site:** na página do projeto, clique no ícone **</>** (Web) → apelido `site` → **Registrar app**. Aparece um trecho `const firebaseConfig = { ... }`. Copie esse trecho inteiro e crie na Vercel a variável `FCM_WEB_CONFIG` com ele. Esses dados são públicos (o navegador precisa deles), não são senha.
3. **Chave do navegador:** ⚙ **Configurações do projeto → Cloud Messaging → Certificados push da Web → Gerar par de chaves**. Copie a chave e crie na Vercel `FCM_VAPID_KEY`.
4. **Chave do servidor (secreta):** ⚙ **Configurações do projeto → Contas de serviço → Gerar nova chave privada**. Baixa um arquivo `.json`. Abra no Bloco de Notas, copie tudo e crie na Vercel `FCM_SA` com esse conteúdo. Esse arquivo é uma senha: nunca no chat nem no GitHub. Depois de colar, pode apagar o arquivo.
5. Na mesma tela de Cloud Messaging, confira se **API Firebase Cloud Messaging (V1)** está **Ativada** (em projeto novo já vem).
6. **Redeploy** na Vercel.
7. **Tabelas:** Supabase → SQL Editor → cole `supabase/05_notificacoes.sql` → Run.
8. **Vigia de 1 em 1 minuto:** abra `supabase/06_vigia_cron.sql`, cole no SQL Editor, troque `COLE_AQUI_O_CRON_SECRET` pelo valor do seu `CRON_SECRET` (digitando ali mesmo, no Supabase) → Run.
9. **Teste:** no site, **Mais → Notificações → Ativar avisos**. Em segundos chega "🔔 Avisos ligados". No dia de jogo de um time seu, os avisos chegam sozinhos.

## Página da liga

- Toque no nome ou no escudo de uma liga na lista de **Partidas**, no botão **"Jogos, rodadas e artilheiros"** da página Ligas, no nome da liga no topo da **Central do jogo** ou da **página do time**. Endereço próprio: `/#liga-71`.
- **Resumo:** progresso da temporada, jogos da rodada atual, números da temporada (gols por jogo, vitórias do mandante, empates, jogos com 3+ gols, os dois marcam, maior goleada), os primeiros da tabela e os 5 artilheiros.
- **Jogos:** todas as rodadas numeradas, com setas e a lista de rodadas para pular direto; os jogos vêm agrupados por dia e abrem a central. Nas copas, as fases aparecem pelo nome (Grupos, Oitavas, Quartas…).
- **Classificação:** tabela com zonas e últimos 5 (grupos nas copas), com atalho para a tabela completa com xG.
- **Artilheiros:** artilharia, garçons e cartões amarelos (top 20), com pênaltis, minutos por gol e nota; tocar no time abre a página dele.
- A lista de jogos da temporada é renovada a cada 2 minutos quando há jogo começando ou acabando, e de hora em hora no resto do tempo; artilharia a cada 6 horas.

## Página do time

- Toque no nome ou no escudo de um time na **tabela das ligas** (e das copas), no **topo da central do jogo** ou no título das **escalações**. Endereço próprio: `/#time-127` (o número é o id do time na API-Football), dá para compartilhar.
- **Resumo:** cabeçalho com estádio, fundação, posição e forma; próximo jogo com contagem regressiva e atalho para a prévia; Leitura TEL.SCORE (forma, gols, casa e fora, xG da temporada e situação na tabela); trecho da tabela; desempenho pelo xG; desfalques do próximo jogo; últimos 5 jogos.
- **Elenco:** elenco inteiro por posição, com idade, número, jogos, minutos, gols, assistências, cartões e nota; destaques (artilheiro, garçom, melhor nota, mais minutos) e quem está fora do próximo jogo.
- **Jogos:** últimos 10 e próximos 5 (toque abre a central), com o xG de cada jogo guardado e gráfico "xG jogo a jogo".
- **Números:** campanha, casa x fora (com xG), gols por faixa de minutos, sequências e recordes, formações, pênaltis, cartões e médias por jogo da base TEL.SCORE.
- Cada aba busca só o que precisa, com cache longo (dados do clube: 7 dias; elenco: 24 h; números do elenco: 12 h; estatísticas da temporada: 6 h), para poupar a cota da API.

## Posts na nuvem (parte 4)

- Tabela `posts` no Supabase. No Estúdio, em **Meus posts salvos**, clique em **Ligar a nuvem** e digite a senha `POSTS_SENHA`.
- Com a nuvem ligada, todo post salvo vai para o banco e aparece no celular e no computador. Excluir em um aparelho exclui em todos. Sem internet, o post fica no aparelho e sobe na próxima vez.
- A senha fica guardada só no navegador onde você entrou. **Sair** desliga a nuvem naquele aparelho sem apagar nada.

## Ao vivo mais rápido

- A API-Football atualiza os jogos a cada ~15 segundos. Com o plano Pro, o servidor guarda a resposta ao vivo por **15 s** (antes 2 min) e o site confere a cada 15 s; ao voltar para o app, atualiza na hora.
- Corrigido: depois das 21h (Brasília) a lista de jogos do dia era tratada como "dia passado" (o dia em UTC já tinha virado) e ficava guardada por horas, atrasando o início dos jogos da noite. Agora "hoje" é calculado no fuso do site, e listas com jogo começando ou acabando de terminar são conferidas a cada minuto.
- Jogo que começa em até 2 horas é conferido de minuto em minuto, para pegar o apito inicial.
- `CACHE_LIVE_SECONDS` continua valendo para ajustar (padrão `15`).
- Gasto estimado em dia cheio de jogos (8 horas com bola rolando e várias centrais abertas): até uns 4.000 requisições, dentro das 7.500 do Pro. Para economizar, use `CACHE_LIVE_SECONDS` = `30`.

## Estúdio: pré-jogo completo

- Ao abrir um jogo que ainda não começou, o Estúdio busca também a tabela, as tendências dos últimos 10 jogos de cada time, os destaques do elenco (artilheiro, garçom, melhor nota), o perfil do árbitro e os confrontos com estatísticas.
- Formatos novos de pré-jogo: **Guia completo do jogo** (até 9 slides), **Raio-x dos gols**, **Tendências dos times**, **xG da temporada**, **Mandante x visitante**, **O que está em jogo** (tabela e para onde cada um vai com a vitória), **Jogadores para ficar de olho** e **Quem apita o jogo**. Cada um só aparece quando há dados para ele.
- Formatos antigos melhorados: Retrospecto (lista visual e xG dos confrontos), Ficha do jogo (árbitro, tabela e favorito) e Momento dos times (últimos 10 jogos).
- Plataformas novas: **Post único** (uma imagem 1080×1350 com capa e os 3 pontos principais) e **WhatsApp e Telegram** (mensagem com *negrito* e _itálico_ pronta para grupos e canais).
- **Vídeo animado das tabelas:** agora funciona nos posts de tabela, com abertura em pódio (1º, 2º e 3º), a classificação animada e as leituras.

## Estúdio: mata-mata (chaveamento)

Em **Estúdio → Tabelas**, ao escolher uma copa (Libertadores, Sul-Americana, Champions, Europa League, Conference League ou **Copa do Brasil**), aparece a chave **Fase de grupos (ou Fase de liga) · Mata-mata · chaveamento** logo acima dos formatos. Quando o mata-mata já começou, o Estúdio abre direto nele. Na aba **Ligas**, cada copa também tem o botão **Gerar post do mata-mata** (ou da tabela). Os formatos do mata-mata:

- **Chaveamento:** a chave das oitavas até a final, com escudos, placar agregado, pênaltis entre parênteses e quem avançou em vermelho; depois, um slide por fase.
- **Confrontos da fase:** cada duelo da fase atual, com ida e volta e o que cada time precisa ("precisa vencer por 2 gols; vitória por 1 leva aos pênaltis").
- **Quem avançou:** os classificados da última fase, a classificação mais tranquila, os jogos decididos nos pênaltis e a média de gols.
- **Agenda do mata-mata:** os próximos jogos com data e hora e, entre parênteses, o placar da ida.
- **O caminho de cada um:** quem cada time vivo eliminou até aqui (e a campanha na fase de grupos). Escolha um time em "Foco" para ele aparecer primeiro.
- **Enquete: quem leva?:** com o chaveamento e as opções.

Funciona em todos os formatos de saída (carrossel, post único, story, vídeo animado, WhatsApp, X etc.). Os confrontos saem da lista de jogos da competição, atualizada a cada 30 minutos.

## Estúdio: Times (o momento de um time)

Em **Estúdio → Times**, escolha a liga e o time (os seus times favoritos aparecem primeiro). Na página de qualquer time, o botão **✎ Post** abre o Estúdio direto nele. O site junta, para o time:

- **A tabela da liga nacional:** posição, pontos, aproveitamento, distância para o líder, para a zona de cima (Libertadores, Champions, acesso etc.) e para o rebaixamento, com a conta de quantos jogos faltam. Quando a matemática já decide, o post diz: campeão, rebaixado, livre do rebaixamento ou vaga garantida.
- **Todas as competições da temporada:** continental, copa nacional e estadual. Para cada uma: vivo (com a fase e o próximo jogo), eliminado (em que fase e por quem, com o agregado), campeão ou vice. Amistosos ficam de fora.
- **A fase recente:** pontos nos últimos 5 jogos, sequências (vitórias seguidas, invencibilidade, jejum), gols marcados e sofridos, casa e fora.
- **A agenda** e **os destaques do elenco** (artilheiro, garçom, melhor nota e quem mais joga).

Formatos: **Momento do time** (raio-x completo), **Todas as frentes**, **Situação na tabela**, **Fase recente**, **Próximos jogos**, **Destaques do elenco** e **Enquete do time**. Funcionam em todas as saídas (carrossel, post único, story, vídeo animado, WhatsApp, X, LinkedIn e newsletter). Cada time gasta de 6 a 10 requisições na primeira vez; depois fica no cache.

## Estúdio: jogador em foco

Em **Estúdio → Jogos**, escolha a partida e, em **Foco**, um jogador. A lista de formatos troca para os formatos do jogador, e a foto dele aparece na capa de todos (carrossel, post único, story e vídeo). Com o foco em "Automático" ou num time, os formatos do jogo continuam os mesmos de sempre (Craque do jogo, Herói invisível, Quem ficou devendo, Relatório de scout etc.).

- **Veredito TEL.SCORE:** a nota do jogador no jogo é comparada com a média dele na temporada (todas as competições) ou, quando não há temporada, com a média do time no jogo. O resultado é DECIDIU O JOGO (gol ou assistência com nota alta), BRILHOU (nota 8 ou mais), ENTREGOU, NA MÉDIA, FICOU DEVENDO ou POUCO TEMPO (menos de 25 minutos, sem gol nem assistência).
- **Formatos:** Atuação completa, Entregou ou ficou devendo?, Números do jogo, Raio-x no jogo (percentis contra os jogadores da partida), Duelo direto (contra o melhor rival da mesma função), No ranking do jogo, Jogo x temporada e Enquete do jogador.
- A temporada do jogador vem da lista de jogadores do time na API-Football (até 3 requisições, guardadas por 12 horas). Enquanto carrega, o formato "Jogo x temporada" aparece como "Carregando a temporada do jogador…".

## Revisão dos posts

- O carrossel agora tem até 10 slides (antes 5): nenhuma informação do post fica de fora; o que sobra entra no slide anterior.
- Na classificação das copas com grupos, todos os grupos aparecem (antes, só 7).
- O vídeo animado tem até 6 cenas de análise (8 no Guia completo e no mata-mata), com títulos de cena tirados do próprio texto.
- **Pré-jogo:** todo vídeo ganhou a cena **Comparativo** (aproveitamento, gols marcados e sofridos por jogo, pontos nos últimos 5, xG da temporada e jogos sem sofrer gol, lado a lado). "Momento dos times" compara campanha e mandante em casa x visitante fora; "Jogadores para ficar de olho" abre com os artilheiros frente a frente.
- O perfil do árbitro mostra o nome das competições em português.
- Os escudos ficam inteiros dentro da bolinha, no site e nas imagens dos posts.

### Revisão 2: comparação completa entre os times

- **Estatísticas lado a lado:** novo visual com os dois times e até 10 números, cada um com barra saindo do centro e o melhor em vermelho (estilo app de placar).
  - **Pós-jogo:** posse, xG, finalizações, no alvo, dentro da área, escanteios, passes, precisão, defesas do goleiro, faltas e cartões. Entra em Resumo em números, O placar mentiu?, Quem mandou no jogo, Frente a frente, Eficiência, Posse × perigo, Desenho tático, Ajuste do intervalo, Debate, Jogo pegado?, Números que ninguém viu, Enquete e Opinião forte.
  - **Pré-jogo ("Frente a frente"):** posição e pontos na tabela, aproveitamento, gols marcados e sofridos por jogo, mandante em casa x visitante fora, jogos sem sofrer gol, xG criado e cedido, pontos nos últimos jogos e jogos com mais de 2,5 gols. Entra em quase todos os pré-jogos.
- **Vídeo animado:** a cena de números agora é o "lado a lado" completo (antes eram só 5 barras), em tamanho grande para o celular.
- **Slides que cortavam informação:** o slide de gols mostra todos os gols; o carrossel vai até 13 slides antes de juntar conteúdo; "Notas dos jogadores" mostra a nota certa no card de cada jogador.
- **Prévia do jogo:** desfalques com os nomes (antes só a quantidade) e o confronto direto com os últimos jogos. No Guia completo, até 4 desfalques por time.
- **Fase de grupos:** dois grupos por slide, com J, V, E, D, SG e PTS. As tabelas de liga também ganharam V, E e D.

## Foto do estádio na capa

- A capa confere se a foto do estádio realmente abre. Se a API não tiver foto (ou o jogo vier sem estádio cadastrado), tenta a foto do estádio do clube mandante, quando é o mesmo estádio.
- Se não houver foto, a capa usa o fundo da TEL.SCORE e o Estúdio avisa embaixo de "Foto de capa", sugerindo escolher uma foto.
- O servidor de imagens aceita fotos de até 4 MB (antes 2 MB) e as imagens têm até 15 s para carregar antes de gerar os PNGs.

## Consumo de requisições

O plano grátis da API-Football permite 100 requisições por dia; o Pro, 7.500 (o site está no Pro). Graças ao cache, cada tela é buscada no máximo uma vez por período, não importa quantas pessoas estejam no site:

| Pedido | Renovado a cada |
|---|---|
| Jogos de um dia com partida ao vivo | `CACHE_LIVE_SECONDS` (padrão 2 min) |
| Jogos de hoje sem partida ao vivo | 5 min |
| Jogos de dias anteriores | 6 h |
| Partida encerrada (central) | 24 h |
| Classificação | 10 min |
| Histórico do árbitro (jogos da temporada) | 12 h |
| Contexto do jogo: odds e tabela (Estúdio e Leitura TEL.SCORE) | 1 h |
| Nível da liga dos clubes em copas e competições continentais | 30 min |

O plano grátis serve para testar. Para acompanhar rodadas inteiras ao vivo, o plano Pro dá folga.

## Ligas acompanhadas

São 22, organizadas em grupos no site (aba Ligas, menu Mais e seletores do Estúdio):

| Grupo | Ligas (id na API-Football) |
|---|---|
| Brasil | Brasileirão Série A (71), Série B (72), Copa do Brasil (73) |
| Copas | Libertadores (13), Sul-Americana (11), Champions League (2), Europa League (3), Conference League (848) |
| Europa | Premier League (39), La Liga (140), Serie A (135), Bundesliga (78), Ligue 1 (61) |
| Mais Europa | Liga Portugal (94), Eredivisie (88) |
| América do Sul | Liga Argentina (128), Liga Colombiana (239) |
| Segundas divisões | Championship (40), La Liga 2 (141), Serie B italiana (136), 2. Bundesliga (79), Ligue 2 (62) |

- Estão na lista `RL` dentro do `index.html` (procure por "Ligas acompanhadas"), com o grupo de cada uma. Para incluir outra, adicione o id da API-Football ali **e** na lista `LIGAS` do `api/banco.js` (para o banco guardar os jogos).
- **Ligas em fases (Argentina e Colômbia):** a tabela mostra a fase atual (por exemplo, Clausura · Grupo A) e botões para as outras fases: o outro grupo, a tabela anual e as fases já encerradas. As rodadas aparecem como "Clausura · Rodada 12".
- **Zonas novas na tabela:** acesso direto, playoff de acesso (segundas divisões) e "classifica para os playoffs" (Argentina e Colômbia).
- A Conference League funciona como a Champions e a Europa League: fase de liga com 36 clubes e aba de mata-mata.
- O nome da liga colombiana aparece como "Liga Colombiana", sem o nome do patrocinador.

## Créditos

- Dados de partidas: [API-Football](https://www.api-football.com). Escudos e logos servidos pela própria API.
- Dados de evento da análise tática: [StatsBomb Open Data](https://github.com/statsbomb/open-data). Pelos termos da StatsBomb, toda análise publicada com esses dados deve citar a StatsBomb como fonte e usar a logo deles (disponível no Media Pack da StatsBomb).
