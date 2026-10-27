-- TEL.SCORE · agenda o "vigia" das notificações para rodar a cada minuto.
-- Rode DEPOIS do 05_notificacoes.sql e depois de subir o site com o arquivo api/avisos.js.
--
-- ANTES DE RODAR: troque COLE_AQUI_O_CRON_SECRET pela mesma senha que está na variável
-- CRON_SECRET da Vercel. Faça isso só aqui no SQL Editor do Supabase; nunca mande essa senha no chat.

-- 1) liga as extensões de agendamento e de chamadas HTTP (Database → Extensions também mostra as duas)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) se já existir um agendamento com esse nome, remove para recriar
select cron.unschedule(jobid) from cron.job where jobname = 'telscore-vigia';

-- 3) a cada minuto, chama o vigia do site
select cron.schedule(
  'telscore-vigia',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://www.telscore.com.br/api/avisos?acao=vigiar',
    headers := jsonb_build_object('Authorization', 'Bearer COLE_AQUI_O_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Para conferir se está rodando:
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Para ver as respostas do site:
--   select status_code, content from net._http_response order by created desc limit 10;
-- Para pausar os avisos:
--   select cron.unschedule('telscore-vigia');
