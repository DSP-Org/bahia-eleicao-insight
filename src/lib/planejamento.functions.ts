import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

const checarSenha = (senha: string) => {
  const certa = process.env["PLANEJAMENTO_SENHA"];
  if (!certa) throw new Error("A senha de acesso ainda não foi configurada.");
  const a = createHash("sha256").update(senha, "utf8").digest();
  const b = createHash("sha256").update(certa, "utf8").digest();
  if (!timingSafeEqual(a, b)) throw new Error("PIN incorreto.");
};

export const verificarPinPlanejamento = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ senha: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    checarSenha(data.senha);
    return { ok: true as const };
  });

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
