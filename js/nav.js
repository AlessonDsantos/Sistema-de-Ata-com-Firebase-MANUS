// Abas do topo: mostra só as áreas que a pessoa pode acessar
import { $ } from './util.js';

const VIEWS = ['atas', 'disc', 'agenda', 'usuarios'];
let permitidas = [];

export function configurarAbas(lista) {
    permitidas = lista;
    VIEWS.forEach(v => document.querySelector(`.nav-btn[data-view="${v}"]`).classList.toggle('hidden', !lista.includes(v)));
    // Com uma aba só, não precisa mostrar a navegação
    document.querySelector('.app-nav').classList.toggle('hidden', lista.length < 2);
    $('tela-sem-acesso').classList.toggle('hidden', lista.length > 0);
    let salva = null;
    try { salva = localStorage.getItem('telaAtual'); } catch (e) {}
    if (lista.length) mostrarTela(lista.includes(salva) ? salva : lista[0]);
}

export function mostrarTela(v) {
    if (!permitidas.includes(v)) return;
    VIEWS.forEach(x => $('view-' + x).classList.toggle('hidden', x !== v));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    try { localStorage.setItem('telaAtual', v); } catch (e) {}
}

export function initNav() {
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => mostrarTela(b.dataset.view)));
}
