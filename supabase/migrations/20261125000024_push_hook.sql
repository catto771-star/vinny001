-- Revisão 3: cada notificação nova chama a função send-push (só onde o pg_net existe, ou seja, no Supabase).
-- O endereço e o segredo ficam no Vault (nunca no repositório).
create or replace function public.notify_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regproc('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then return new; end if;
  if cardinality(public.push_keys(new.kind, new.payload)) = 0 then return new; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'push_hook_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'push_hook_secret';
  if v_url is null or v_secret is null then return new; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url, jsonb_build_object('notification_id', new.id), jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret);
  return new;
exception when others then
  return new; -- push nunca impede o registro
end
$$;
revoke all on function public.notify_push() from public, anon, authenticated;
create trigger notifications_push after insert on public.notifications for each row execute function public.notify_push();
