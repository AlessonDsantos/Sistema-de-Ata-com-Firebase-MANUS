// Utilitários compartilhados (sistema interno e agenda pública)

export const $ = id => document.getElementById(id);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// --- Datas ---
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const pad = n => String(n).padStart(2, '0');
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const hoje = () => toISO(new Date());

export function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

export function dataPorExtenso(iso, comAno = true) {
    if (!iso) return 'Sem data';
    const d = parseISO(iso);
    return `${DIAS_LONGOS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}${comAno ? ` de ${d.getFullYear()}` : ''}`;
}

export function mesesDesde(dateStr) {
    const a = parseISO(dateStr), b = new Date();
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
}

export function tempoTxt(dateStr) {
    if (dateStr > hoje()) return 'agendado';
    const m = mesesDesde(dateStr);
    if (m < 1) return 'há menos de 1 mês';
    if (m === 1) return 'há 1 mês';
    if (m < 24) return `há ${m} meses`;
    const anos = Math.floor(m / 12), resto = m % 12;
    return `há ${anos} anos${resto ? ` e ${resto} ${resto === 1 ? 'mês' : 'meses'}` : ''}`;
}

export const diasEntre = (a, b) => Math.abs(parseISO(a) - parseISO(b)) / 86400000;

// --- Avisos ---
let toastTimer = null;
export function showToast(message, type = 'success', ms = 3000) {
    const toast = $('toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.style.backgroundColor = { success: '#27ae60', error: '#e74c3c', info: '#2c3e50' }[type] || '#27ae60';
    toast.style.display = 'block';
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, ms);
}

// --- Modais ---
// Ao fechar, o modal dispara o evento "modal-fechado" para quem precisar limpar estado.
export function abrirModal(id) {
    $(id).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function fecharModal(id) {
    const el = $(id);
    if (!el || el.classList.contains('hidden')) return;
    el.dispatchEvent(new CustomEvent('modal-antes-fechar'));
    el.classList.add('hidden');
    if (!document.querySelector('.modal-overlay:not(.hidden)') && document.querySelector('#leitor')?.classList.contains('hidden') !== false) {
        document.body.style.overflow = '';
    }
    el.dispatchEvent(new CustomEvent('modal-fechado'));
}

export function initModais() {
    document.querySelectorAll('.modal-overlay').forEach(ov => {
        ov.addEventListener('mousedown', e => { if (e.target === ov) fecharModal(ov.id); });
        ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => fecharModal(ov.id)));
    });
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        const abertos = [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
        if (abertos.length) fecharModal(abertos[abertos.length - 1].id);
    });
}

// --- Indicador de conexão no topo ---
export function updateStatus(status) {
    const dot = document.querySelector('.status-dot');
    const txt = $('status-text');
    if (!dot || !txt) return;
    dot.className = 'status-dot ' + status;
    txt.textContent = {
        online: 'Conectado e sincronizado',
        offline: 'Sem internet: alterações ficam salvas no aparelho',
        connecting: 'Conectando...',
        saving: 'Sincronizando alterações...',
        erro: 'Erro ao conectar'
    }[status] || '';
}
export function statusDoSnapshot(snapshot) {
    if (!navigator.onLine) updateStatus('offline');
    else updateStatus(snapshot.metadata.hasPendingWrites ? 'saving' : 'online');
}

// Cor de texto legível sobre uma cor de fundo
export function corTexto(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#1d1d1d' : '#ffffff';
}

export function hexAlpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
