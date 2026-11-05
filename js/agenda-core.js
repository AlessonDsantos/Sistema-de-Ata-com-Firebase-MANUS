// Agenda: organizações, cores e desenho do calendário (compartilhado entre a agenda interna e a pública)
import { esc, DIAS, MESES, toISO, hoje, dataPorExtenso, parseISO, corTexto, hexAlpha } from './util.js';

export const ORGS = {
    ala:         { nome: 'Ala / Bispado',                 cor: '#1f3a5f' },
    socorro:     { nome: 'Sociedade de Socorro',          cor: '#8e2445' },
    elderes:     { nome: 'Quórum de Élderes',             cor: '#2f74c0' },
    mocas:       { nome: 'Moças',                         cor: '#d6619c' },
    rapazes:     { nome: 'Rapazes',                       cor: '#2e7d4f' },
    primaria:    { nome: 'Primária',                      cor: '#e6b400' },
    escola:      { nome: 'Escola Dominical',              cor: '#e67e22' },
    templo:      { nome: 'Templo e História da Família',  cor: '#7b4bb7' },
    missionaria: { nome: 'Obra Missionária',              cor: '#169c8e' }
};

const orgDe = a => ORGS[a.org] || { nome: 'Outra', cor: '#7f8c8d' };

export const horario = a => a.inicio ? (a.fim ? `${a.inicio} às ${a.fim}` : a.inicio) : '';

export function orgBadge(key) {
    const o = ORGS[key] || { nome: key, cor: '#7f8c8d' };
    return `<span class="org-badge" style="background:${o.cor};color:${corTexto(o.cor)}">${esc(o.nome)}</span>`;
}

// Calendário do mês. "clicavel(iso, atividade)" decide quais dias abrem ao clicar.
export function gradeHTML(y, m, agenda, clicavel) {
    const first = new Date(y, m, 1);
    const start = new Date(y, m, 1 - first.getDay());
    const t = hoje();
    let html = DIAS.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (i % 7 === 0 && i > 0 && d.getMonth() !== m) break;
        const iso = toISO(d);
        const fora = d.getMonth() !== m;
        const a = fora ? null : agenda[iso];
        const clique = !fora && clicavel(iso, a);
        const cls = ['ag-cell', fora && 'out', iso < t && 'passado', iso === t && 'today', a && 'tem', clique && 'clicavel'].filter(Boolean).join(' ');
        let style = '', inner = '';
        if (a) {
            const o = orgDe(a);
            style = ` style="--org:${o.cor};--org-bg:${hexAlpha(o.cor, 0.14)}"`;
            inner = `<div class="ag-chip" style="background:${o.cor};color:${corTexto(o.cor)}" title="${esc(`${o.nome}: ${a.titulo}${a.inicio ? ' · ' + horario(a) : ''}`)}">${a.inicio ? `<b>${esc(a.inicio)}</b> ` : ''}${esc(a.titulo)}</div><span class="ag-dot"></span>`;
        }
        html += `<div class="${cls}"${clique ? ` data-date="${iso}"` : ''}${style}><span class="cal-num">${d.getDate()}</span>${inner}</div>`;
    }
    return html;
}

export function legendaHTML() {
    return Object.values(ORGS).map(o => `<span class="ag-leg"><i style="background:${o.cor}"></i>${esc(o.nome)}</span>`).join('');
}

// Item de lista (próximas atividades)
export function itemHTML(a) {
    const d = parseISO(a.data);
    const o = orgDe(a);
    const info = [horario(a), a.local].filter(Boolean).map(esc).join(' · ');
    return `<div class="ag-item" data-date="${a.data}" style="--org:${o.cor}">
        <div class="ag-item-data"><b>${d.getDate()}</b><span>${MESES[d.getMonth()].slice(0, 3)}</span><small>${DIAS[d.getDay()]}</small></div>
        <div class="ag-item-info">
            <div class="ag-item-titulo">${esc(a.titulo)}</div>
            ${info ? `<div class="ag-item-meta"><i class="far fa-clock"></i> ${info}</div>` : ''}
            <div class="ag-item-org"><i style="background:${o.cor}"></i>${esc(o.nome)}</div>
        </div>
    </div>`;
}

// Lista agrupada por mês
export function listaHTML(atividades, vazio = 'Nenhuma atividade marcada.') {
    if (!atividades.length) return `<p class="empty-msg">${vazio}</p>`;
    let mesAtual = '', html = '';
    atividades.forEach(a => {
        const d = parseISO(a.data);
        const chave = `${MESES[d.getMonth()]} ${d.getFullYear()}`;
        if (chave !== mesAtual) { mesAtual = chave; html += `<div class="or-grupo">${chave}</div>`; }
        html += itemHTML(a);
    });
    return html;
}

// Detalhe de uma atividade
export function detalheHTML(a) {
    const o = orgDe(a);
    return `<div class="ag-detalhe" style="--org:${o.cor}">
        ${orgBadge(a.org)}
        <h3>${esc(a.titulo)}</h3>
        <div class="ag-det-linha"><i class="far fa-calendar"></i> ${esc(dataPorExtenso(a.data))}</div>
        ${a.inicio ? `<div class="ag-det-linha"><i class="far fa-clock"></i> ${esc(horario(a))}</div>` : ''}
        ${a.local ? `<div class="ag-det-linha"><i class="fas fa-location-dot"></i> ${esc(a.local)}</div>` : ''}
        ${a.descricao ? `<div class="ag-det-desc">${esc(a.descricao)}</div>` : ''}
    </div>`;
}
