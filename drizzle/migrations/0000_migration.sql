CREATE TABLE public.planejamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cargo text NOT NULL,
  candidato_id text NOT NULL,
  candidato_nome text NOT NULL,
  metas jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.planejamentos TO anon, authenticated;
GRANT ALL ON public.planejamentos TO service_role;
ALTER TABLE public.planejamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública dos planejamentos" ON public.planejamentos FOR SELECT TO anon, authenticated USING (true);