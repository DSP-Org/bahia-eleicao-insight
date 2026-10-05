import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import logoUrl from "../assets/logo-barras.png";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Voltar ao início</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Esta página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">Algo deu errado. Tente novamente.</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Tentar de novo</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Data5 Analytics — Eleições 2026 - BA" },
      { name: "description", content: "Resultados oficiais do TSE das Eleições 2026 na Bahia: mapas, relatórios e comparativos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,900&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" },
      { rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV = [
  { to: "/", label: "Início" },
  { to: "/mapa", label: "Mapa" },
  { to: "/comparar", label: "Comparar" },
  { to: "/relatorios", label: "Relatórios" },
  { to: "/meta-x-urna", label: "Meta x Urna" },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen">
        <header className="border-b border-border bg-card">
          <div className="mx-auto grid max-w-7xl gap-3 px-4 py-3 md:flex md:flex-wrap md:items-center md:justify-between">
            <Link to="/" className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
              <img src={logoUrl} alt="Data5 Analytics" className="h-11 w-auto shrink-0" width={1280} height={640} />
              <span className="border-l border-border pl-3 font-sans text-xs font-medium uppercase tracking-wide text-muted-foreground">Eleições 2026 - BA</span>
            </Link>
            <nav aria-label="Navegação principal" className="grid grid-cols-3 gap-1 text-center text-sm sm:flex sm:flex-wrap">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
                  className="rounded-md px-3 py-1.5 hover:bg-accent"
                  activeProps={{ className: "bg-foreground text-background hover:bg-foreground" }}>
                  {n.label}
                </Link>
              ))}
              <Link to="/cargo/$cargo" params={{ cargo: "governador" }} className="rounded-md px-3 py-1.5 hover:bg-accent"
                activeProps={{ className: "bg-foreground text-background hover:bg-foreground" }}>Cargos</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 md:py-8">
          <Outlet />
        </main>
        <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Data5 Analytics · Fonte: Tribunal Superior Eleitoral (resultados.tse.jus.br) · 1º turno, 04/10/2026 · Malha municipal: IBGE
        </footer>
      </div>
    </QueryClientProvider>
  );
}
