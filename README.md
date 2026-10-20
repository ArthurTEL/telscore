# TEL.SCORE

Placar ao vivo, central do jogo e análise de desempenho no futebol, com gerador de posts para criadores de conteúdo.

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

No celular, as seções ficam numa barra fixa embaixo (Jogos, Central, Ligas, Análise, Estúdio), como num app. O cabeçalho fica compacto, os filtros deslizam para o lado e os jogos aparecem com um time por linha.

## Tema dia e noite

No topo do site há três botões: dia, noite e automático (segue o tema do celular ou computador). A escolha fica salva no navegador de cada visitante.

## Configuração na Vercel

1. Em **Settings → Environment Variables** do projeto, crie:
   - `API_FOOTBALL_KEY` = sua chave (painel da API-Football → My Access).
   - Opcional: `CACHE_LIVE_SECONDS` = de quantos em quantos segundos o placar ao vivo é buscado de novo. Padrão: `120`. Com o plano pago, pode baixar para `30`.
2. Faça um novo deploy (**Deployments → ⋯ → Redeploy**). Variáveis novas só valem depois de um deploy.

## Consumo de requisições

O plano grátis da API-Football permite 100 requisições por dia. Graças ao cache, cada tela é buscada no máximo uma vez por período, não importa quantas pessoas estejam no site:

| Pedido | Renovado a cada |
|---|---|
| Jogos de um dia com partida ao vivo | `CACHE_LIVE_SECONDS` (padrão 2 min) |
| Jogos de hoje sem partida ao vivo | 5 min |
| Jogos de dias anteriores | 6 h |
| Partida encerrada (central) | 24 h |
| Classificação | 1 h |
| Histórico do árbitro (jogos da temporada) | 12 h |
| Contexto do jogo: odds e tabela (Estúdio e Leitura TEL.SCORE) | 1 h |
| Nível da liga dos clubes em copas e competições continentais | 30 min |

O plano grátis serve para testar. Para acompanhar rodadas inteiras ao vivo, o plano Pro dá folga.

## Ligas acompanhadas

Estão na lista `RL` dentro do `index.html` (procure por "Ligas acompanhadas"). Para incluir outra, adicione o id da competição na API-Football.

## Créditos

- Dados de partidas: [API-Football](https://www.api-football.com). Escudos e logos servidos pela própria API.
- Dados de evento da análise tática: [StatsBomb Open Data](https://github.com/statsbomb/open-data). Pelos termos da StatsBomb, toda análise publicada com esses dados deve citar a StatsBomb como fonte e usar a logo deles (disponível no Media Pack da StatsBomb).
