-- Add optional email field to client for account creation / contact
ALTER TABLE public.client
ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.client
ADD COLUMN IF NOT EXISTS account_invite_status text;

ALTER TABLE public.client
ADD COLUMN IF NOT EXISTS account_invite_error text;

ALTER TABLE public.client
ADD COLUMN IF NOT EXISTS account_invited_at timestamptz;
