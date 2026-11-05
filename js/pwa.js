// App instalável (PWA): registra o service worker e mostra o convite para instalar
import { $, showToast } from './util.js';

let eventoInstalar = null;
const ehStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function bannerDispensado() {
    try { return Date.now() - (+localStorage.getItem('pwaDispensado') || 0) < 3 * 864e5; } catch (e) { return false; }
}
function mostrarBanner() {
    if (!$('install-banner') || ehStandalone() || bannerDispensado()) return;
    $('install-banner').classList.remove('hidden');
}
function esconder() {
    $('install-banner')?.classList.add('hidden');
    $('btn-instalar-header')?.classList.add('hidden');
}
function dispensarBanner() {
    $('install-banner')?.classList.add('hidden');
    try { localStorage.setItem('pwaDispensado', Date.now()); } catch (e) {}
}
async function instalarApp() {
    if (!eventoInstalar) return;
    eventoInstalar.prompt();
    const { outcome } = await eventoInstalar.userChoice;
    eventoInstalar = null;
    $('btn-instalar-header')?.classList.add('hidden');
    if (outcome === 'accepted') esconder(); else dispensarBanner();
}

export function initPWA() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker:', err)));
    }

    // Chrome, Edge e Android: o navegador avisa quando o app pode ser instalado
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        eventoInstalar = e;
        $('btn-instalar-header')?.classList.remove('hidden');
        mostrarBanner();
    });
    window.addEventListener('appinstalled', () => {
        eventoInstalar = null;
        esconder();
        showToast('App instalado! Agora ele abre pela tela inicial.');
    });

    // iPhone/iPad: o Safari não tem botão de instalar, então mostra o passo a passo
    if (ehIOS && !ehStandalone() && $('ib-msg')) {
        $('ib-msg').innerHTML = 'No Safari, toque em <i class="fas fa-arrow-up-from-bracket"></i> <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.';
        $('ib-instalar').textContent = 'Entendi';
        setTimeout(mostrarBanner, 1500);
    }
    $('ib-instalar')?.addEventListener('click', () => { if (eventoInstalar) instalarApp(); else dispensarBanner(); });
    $('ib-depois')?.addEventListener('click', dispensarBanner);
    $('btn-instalar-header')?.addEventListener('click', instalarApp);
}
