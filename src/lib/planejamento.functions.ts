import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const checarSenha = (senha: string) => {
  const certa = process.env["PLANEJAMENTO_SENHA"];
  if (!certa) throw new Error("A senha de envio ainda não foi configurada.");
  if (senha !== certa) throw new Error("Senha incorreta.");
};

export const salvarPlanejamento = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      senha: z.string().min(1).max(200),
      nome: z.string().trim().min(1).max(120),
      cargo: z.string().min(1).max(40),
      candidato_id: z.string().min(1).max(40),
      candidato_nome: z.string().min(1).max(200),
      metas: z.record(z.string().regex(/^\d{1,6}$/), z.number().int().min(0).max(100_000_000)),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    checarSenha(data.senha);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { senha: _s, ...row } = data;
    const { data: r, error } = await supabaseAdmin.from("planejamentos").insert(row).select("id").single();
    if (error) throw new Error("Não foi possível salvar o planejamento.");
    return { id: r.id };
  });

export const excluirPlanejamento = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ senha: z.string().min(1).max(200), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    checarSenha(data.senha);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("planejamentos").delete().eq("id", data.id);
    if (error) throw new Error("Não foi possível excluir.");
    return { ok: true };
  });
