// Agenda pública (agenda.html): qualquer pessoa vê as atividades de hoje em diante, sem login
import { col } from './firebase.js';
import { $, MESES, hoje, parseISO, initModais, abrirModal } from './util.js';
import { gradeHTML, legendaHTML, listaHTML, detalheHTML } from './agenda-core.js';
import { initPWA } from './pwa.js';

const agora = new Date();
const minY = agora.getFullYear(), minM = agora.getMonth();
let y = minY, m = minM;
let agenda = {};
let carregado = false;

function render() {
    $('pub-titulo').textContent = `${MESES[m]} ${y}`;
    $('pub-prev').disabled = y === minY && m === minM;   // não mostra meses que já passaram
    const t = hoje();
    $('pub-grade').innerHTML = gradeHTML(y, m, agenda, (iso, a) => !!a && iso >= t);
    if (!carregado) return;
    const futuras = Object.values(agenda).filter(a => a.data >= t).sort((a, b) => a.data.localeCompare(b.data));
    $('pub-lista').innerHTML = listaHTML(futuras, 'Nenhuma atividade marcada por enquanto.');
}

function abrir(iso) {
    const a = agenda[iso];
    if (!a) return;
    $('pub-detalhe').innerHTML = detalheHTML(a);
    abrirModal('modal-pub');
}

function mudarMes(delta) {
    const d = new Date(y, m + delta, 1);
    if (d.getFullYear() < minY || (d.getFullYear() === minY && d.getMonth() < minM)) return;
    y = d.getFullYear(); m = d.getMonth();
    render();
}

initModais();
initPWA();
$('pub-legenda').innerHTML = legendaHTML();
$('pub-prev').addEventListener('click', () => mudarMes(-1));
$('pub-next').addEventListener('click', () => mudarMes(1));
['pub-grade', 'pub-lista'].forEach(id => $(id).addEventListener('click', e => {
    const el = e.target.closest('[data-date]');
    if (el) abrir(el.dataset.date);
}));
render();

// Só busca atividades de hoje em diante
col.agenda.where('data', '>=', hoje()).onSnapshot(snap => {
    agenda = {};
    snap.docs.forEach(d => { agenda[d.id] = { ...d.data(), data: d.id }; });
    carregado = true;
    render();
}, err => {
    console.error(err);
    $('pub-lista').innerHTML = '<p class="empty-msg">Não foi possível carregar a agenda agora. Tente novamente mais tarde.</p>';
});
