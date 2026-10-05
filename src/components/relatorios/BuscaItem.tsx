import { useMemo, useState, type ReactNode } from "react";
import { slugify } from "@/lib/eleicoes";

// Campo de busca com sugestões. Ignora acentos e aceita vários termos ("tito 13789").
export function BuscaItem<T>({
  itens,
  busca,
  render,
  onEscolher,
  placeholder,
  rotulo,
}: {
  itens: T[];
  busca: (t: T) => string; // texto já sem acento
  render: (t: T) => ReactNode;
  onEscolher: (t: T) => void;
  placeholder: string;
  rotulo: string;
}) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const achados = useMemo(() => {
    const termos = slugify(q.trim()).split(/\s+/).filter(Boolean);
    return termos.length
      ? itens.filter((it) => termos.every((t) => busca(it).includes(t))).slice(0, 12)
      : [];
  }, [q, itens, busca]);

  const escolher = (it: T | undefined) => {
    if (!it) return;
    onEscolher(it);
    setQ("");
    setAberto(false);
    setAtivo(0);
  };

  return (
    <div className="relative min-w-0 max-w-full">
      <input
        value={q}
        placeholder={placeholder}
        aria-label={rotulo}
        onChange={(e) => {
          setQ(e.target.value);
          setAberto(true);
          setAtivo(0);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((a) => Math.min(achados.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            escolher(achados[ativo]);
          } else if (e.key === "Escape") setAberto(false);
        }}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {aberto && q.trim() && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {achados.length ? (
            achados.map((it, i) => (
              <div
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(it);
                }}
                className={`break-words cursor-pointer border-b border-border px-3 py-2 text-sm last:border-0 ${i === ativo ? "bg-accent" : "hover:bg-accent"}`}
              >
                {render(it)}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nada encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}
