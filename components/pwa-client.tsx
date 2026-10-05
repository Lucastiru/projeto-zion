'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function PwaClient() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    try { setDismissed(sessionStorage.getItem('zion:pwa-install-dismissed') === '1' || !!standalone); }
    catch { setDismissed(!!standalone); }

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
      setDismissed(false);
    };
    const onInstalled = () => { setInstallPrompt(null); setDismissed(true); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', onInstalled);

    let reloading = false;
    const controllerChanged = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', controllerChanged);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').then(reg => {
        setRegistration(reg);
        if (reg.waiting) setUpdateReady(true);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true);
          });
        });
        void reg.update();
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', onInstalled);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged);
    };
  }, []);

  async function install() {
    if (!installPrompt) { setShowIosHelp(true); return; }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setDismissed(true);
    setInstallPrompt(null);
  }
  function dismiss() {
    try { sessionStorage.setItem('zion:pwa-install-dismissed', '1'); } catch {}
    setDismissed(true);
  }
  function update() {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }

  return <>
    {!online && <div className="pwa-offline" role="status"><WifiOff size={15}/> Sem internet — usando dados salvos</div>}
    {updateReady && <aside className="pwa-card" aria-live="polite">
      <RefreshCw size={21}/><div><strong>Nova versão disponível</strong><span>Atualize para receber as melhorias.</span></div>
      <button type="button" className="pwa-action" onClick={update}>Atualizar</button>
    </aside>}
    {!updateReady && !dismissed && (installPrompt || ios) && <aside className="pwa-card" aria-live="polite">
      <Download size={21}/><div><strong>Instalar Operação Igreja</strong><span>{showIosHelp ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.' : 'Abra o sistema como um aplicativo no celular.'}</span></div>
      <button type="button" className="pwa-action" onClick={install}>{ios ? 'Como instalar' : 'Instalar'}</button>
      <button type="button" className="pwa-close" onClick={dismiss} aria-label="Fechar"><X size={16}/></button>
    </aside>}
  </>;
}
