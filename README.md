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
- `api/statsbomb.js`: função de servidor que lê os dados abertos da StatsBomb e transforma os eventos de um jogo (passes, chutes, pressões) em análise tática compacta. Não precisa de chave.

Se a função não responder (site aberto direto do computador, chave ausente ou erro na API), o site entra sozinho em **modo demonstração** e mostra o motivo no topo da página.

## O que já usa dados reais

| Seção | Fonte |
|---|---|
| Partidas (hoje, dias anteriores e próximos) | API-Football |
| Central do jogo: placar, lance a lance, escalações, estatísticas, notas dos jogadores, árbitro | API-Football |
| Ligas: classificação | API-Football |
| Análise tática · jogos atuais (hoje e ontem): linha do tempo, comparativo, destaques, força por setor, radar | API-Football |
| Análise tática · arquivo histórico: xG por chute, mapa de finalizações, rede de passes, mapa de calor, radar, PPDA, field tilt | StatsBomb Open Data |
| Estúdio de posts | Demonstração (próxima etapa) |

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

O plano grátis serve para testar. Para acompanhar rodadas inteiras ao vivo, o plano Pro dá folga.

## Ligas acompanhadas

Estão na lista `RL` dentro do `index.html` (procure por "Ligas acompanhadas"). Para incluir outra, adicione o id da competição na API-Football.

## Créditos

- Dados de partidas: [API-Football](https://www.api-football.com). Escudos e logos servidos pela própria API.
- Dados de evento da análise tática: [StatsBomb Open Data](https://github.com/statsbomb/open-data). Pelos termos da StatsBomb, toda análise publicada com esses dados deve citar a StatsBomb como fonte e usar a logo deles (disponível no Media Pack da StatsBomb).
