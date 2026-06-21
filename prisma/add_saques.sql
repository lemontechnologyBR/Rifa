-- Tabela de saques (Mercado Pago — controle de saldo virtual)
CREATE TABLE IF NOT EXISTS saques (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  valor_bruto REAL NOT NULL,
  taxa REAL NOT NULL DEFAULT 0,
  valor_liquido REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'solicitado',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saques_tenant ON saques(tenant_id);
