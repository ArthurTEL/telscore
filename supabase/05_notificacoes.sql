-- TEL.SCORE · parte 6: notificações (avisos de gol, VAR, vermelho etc.)
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run. Pode rodar mais de uma vez sem problema.

-- 1) o que cada pessoa quer receber: {"on": true, "tipos": ["gol","var",...], "ligas": false}
alter table public.perfis add column if not exists avisos jsonb not null default '{}'::jsonb;

-- 2) celulares e navegadores cadastrados para receber os avisos
create table if not exists public.dispositivos (
  token       text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  plataforma  text not null default 'web',          -- web | android | ios
  criado_em   timestamptz not null default now(),
  visto_em    timestamptz not null default now()
);
create index if not exists dispositivos_user_idx on public.dispositivos (user_id);

-- 3) jogos que o vigia está acompanhando e o que já foi avisado em cada um
create table if not exists public.avisos_jogos (
  fixture_id    bigint primary key,
  inicio        timestamptz not null,
  liga_id       int,
  liga          text,
  mandante_id   int,
  visitante_id  int,
  mandante      text,
  visitante     text,
  status        text,                                -- vazio = ainda não olhamos o jogo
  gols_casa     int,
  gols_fora     int,
  espera        int not null default 0,
  vistos        jsonb not null default '[]'::jsonb,  -- lances já avisados
  lembrete      boolean not null default false,
  escalacao     boolean not null default false,
  inicio_ok     boolean not null default false,
  intervalo     boolean not null default false,
  fim           boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create index if not exists avisos_jogos_inicio_idx on public.avisos_jogos (inicio);

-- 4) pequenas anotações do vigia (ex.: quando a lista do dia foi atualizada)
create table if not exists public.avisos_estado (
  chave         text primary key,
  valor         jsonb,
  atualizado_em timestamptz not null default now()
);

-- Só o servidor do site (chave secreta, nas variáveis da Vercel) lê e grava.
alter table public.dispositivos  enable row level security;
alter table public.avisos_jogos  enable row level security;
alter table public.avisos_estado enable row level security;
revoke all on public.dispositivos, public.avisos_jogos, public.avisos_estado from anon, authenticated;
