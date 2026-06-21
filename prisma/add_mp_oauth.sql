-- OAuth Mercado Pago (marketplace split) por organizador
ALTER TABLE tenants ADD COLUMN mp_user_id TEXT;
ALTER TABLE tenants ADD COLUMN mp_access_token TEXT;
ALTER TABLE tenants ADD COLUMN mp_refresh_token TEXT;
ALTER TABLE tenants ADD COLUMN mp_token_expires_at DATETIME;
ALTER TABLE tenants ADD COLUMN mp_nickname TEXT;
ALTER TABLE tenants ADD COLUMN mp_connected_at DATETIME;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_mp_user_id ON tenants(mp_user_id) WHERE mp_user_id IS NOT NULL;
