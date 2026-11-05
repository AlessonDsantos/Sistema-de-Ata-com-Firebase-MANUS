// Ponto de entrada do sistema (index.html)
import { ehSecretaria, podeAgenda, ehBispado, podeMusica } from './state.js';
import { initModais, updateStatus } from './util.js';
import { initPWA } from './pwa.js';
import { initAuth } from './auth.js';
import { initNav, configurarAbas } from './nav.js';
import { initAtas } from './atas.js';
import { initDiscursantes } from './discursantes.js';
import { initLeitor } from './leitor.js';
import { initAgenda } from './agenda.js';
import { initHinos } from './hinos.js';
import { initUsuarios } from './usuarios.js';

let iniciado = false;

// Chamado quando a pessoa entra com uma conta aprovada
function iniciarApp() {
    if (iniciado) return;
    iniciado = true;

    const abas = [];
    if (ehSecretaria()) {
        abas.push('atas', 'disc');
        initAtas();
        initDiscursantes();
        initLeitor();
    }
    if (podeMusica()) {
        abas.push('hinos');
        initHinos();
    }
    if (podeAgenda()) {
        abas.push('agenda');
        initAgenda();
    }
    if (ehBispado()) {
        abas.push('usuarios');
        initUsuarios();
    }
    if (!abas.length) updateStatus('online');
    configurarAbas(abas);
}

initModais();
initPWA();
initNav();
initAuth(iniciarApp);

window.addEventListener('online', () => updateStatus('saving'));
window.addEventListener('offline', () => updateStatus('offline'));
