import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "data5-install-dismissed";

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallAppBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS não dispara beforeinstallprompt: mostra instrução manual.
    if (isIos()) {
      setShowIosHint(true);
      setVisible(true);
    }

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setDeferred(null);
  };

  return (
    <div className="border-b border-border bg-foreground text-background">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-sm">
        <span className="min-w-0">
          Instale o app <strong>Eleições 2026 - BA</strong> na tela inicial do seu celular.
          {showIosHint && (
            <span className="block text-xs opacity-80">
              No Safari: toque em Compartilhar e depois em “Adicionar à Tela de Início”.
            </span>
          )}
        </span>
        {deferred && (
          <button
            onClick={install}
            className="rounded-md bg-background px-3 py-1 text-sm font-semibold text-foreground"
          >
            Instalar app
          </button>
        )}
        <button onClick={dismiss} aria-label="Fechar aviso de instalação" className="rounded-md px-2 py-1 text-sm opacity-80 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  );
}
