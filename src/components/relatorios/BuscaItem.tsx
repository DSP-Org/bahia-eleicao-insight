import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { slugify } from "@/lib/eleicoes";

// Campo de busca com sugestões. Ignora acentos e aceita vários termos ("tito 13789").
// Com `selecionado`, o nome já escolhido aparece como um campo editável: basta clicar
// nele ou começar a digitar para buscar outro, sem precisar limpar antes.
export function BuscaItem<T>({
  itens,
  busca,
  render,
  onEscolher,
  placeholder,
  rotulo,
  selecionado,
  chip,
  onLimpar,
  rotuloLimpar = "Limpar escolha",
}: {
  itens: T[];
  busca: (t: T) => string; // texto já sem acento
  render: (t: T) => ReactNode;
  onEscolher: (t: T) => void;
  placeholder: string;
  rotulo: string;
  selecionado?: T | null;
  chip?: (t: T) => ReactNode; // como mostrar o escolhido (padrão: render)
  onLimpar?: () => void;
  rotuloLimpar?: string;
}) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [editando, setEditando] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);

  const temSelecionado = selecionado != null;
  const mostrandoChip = temSelecionado && !editando;

  useEffect(() => {
    if (editando && document.activeElement !== campoRef.current) campoRef.current?.focus();
  }, [editando]);

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
    setEditando(false);
  };

  const abrirEdicao = (letra?: string) => {
    setEditando(true);
    setQ(letra ?? "");
    setAberto(true);
    setAtivo(0);
  };

  if (mostrandoChip && selecionado != null) {
    return (
      <div className="relative min-w-0 max-w-full">
        <div
          role="button"
          tabIndex={0}
          title="Clique ou comece a digitar para escolher outro"
          onClick={() => abrirEdicao()}
          onFocus={() => abrirEdicao()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              abrirEdicao();
            } else if (e.key === "Backspace" || e.key === "Delete") {
              e.preventDefault();
              onLimpar?.();
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              abrirEdicao(e.key);
            }
          }}
          className="flex w-full min-w-0 cursor-text items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate font-medium">{(chip ?? render)(selecionado)}</span>
          {onLimpar && (
            <button
              type="button"
              aria-label={rotuloLimpar}
              title={rotuloLimpar}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onLimpar();
              }}
              className="shrink-0 px-1 text-muted-foreground hover:text-foreground"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 max-w-full">
      <input
        ref={campoRef}
        value={q}
        placeholder={placeholder}
        aria-label={rotulo}
        onChange={(e) => {
          setQ(e.target.value);
          setAberto(true);
          setAtivo(0);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => {
          setAberto(false);
          if (temSelecionado) {
            setEditando(false);
            setQ("");
          }
        }}
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
