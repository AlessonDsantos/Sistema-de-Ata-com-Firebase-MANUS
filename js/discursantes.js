// Controle de discursantes: oradores, calendário dos domingos e integração com a ata
import { db, col, TS } from './firebase.js';
import { S } from './state.js';
import {
    $, esc, norm, MESES, DIAS, toISO, parseISO, hoje, formatDate, mesesDesde, tempoTxt, diasEntre,
    showToast, abrirModal, fecharModal
} from './util.js';
import { formAtual, preencherOradores } from './atas.js';
import { agendarSyncTemas } from './hinos.js';

const pendingSync = new Set();   // datas cuja ata precisa ser atualizada após gravar um discurso

export const TIPOS = { adulto: 'Adulto', jovem: 'Jovem', sumo_conselho: 'Sumo Conselho', visitante: 'Visitante' };
export const STATUS = { convidado: 'Convidado', confirmado: 'Confirmado', recusou: 'Recusou', discursou: 'Discursou' };
export const SLOTS = { 1: '1º orador', 2: '2º orador', 3: 'Último orador' };
const DOM_TIPOS = {
    normal: 'Reunião normal',
    jejum: 'Jejum e testemunho',
    conf_geral: 'Conferência Geral',
    conf_estaca: 'Conferência de Estaca',
    outro: 'Sem discursantes (outro)'
};
const DOM_CURTO = { jejum: 'Jejum', conf_geral: 'Conf. Geral', conf_estaca: 'Conf. Estaca', outro: 'Sem discursos' };

function domingosDoMes(y, m) {
    const r = [];
    const d = new Date(y, m, 1);
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    while (d.getMonth() === m) { r.push(toISO(d)); d.setDate(d.getDate() + 7); }
    return r;
}

// --- Regras ---

// Confirmado com data já passada conta como "discursou".
export const effStatus = d => (d.status === 'confirmado' && d.data < hoje()) ? 'discursou' : (d.status || 'convidado');
const contaComoFeito = d => effStatus(d) === 'discursou';
export const vaiParaAta = d => ['confirmado', 'discursou'].includes(effStatus(d));

// 1º domingo do mês é jejum por padrão, a não ser que você marque outra coisa
export const domTipo = date => S.domingos[date]?.tipo || (parseISO(date).getDate() <= 7 ? 'jejum' : 'normal');

const findOrador = nome => {
    const n = norm(nome).trim().replace(/\s+/g, ' ');
    return n ? S.oradores.find(o => norm(o.nome).trim().replace(/\s+/g, ' ') === n) : null;
};
const oradorPorId = id => S.oradores.find(o => o.id === id);

function discursosDe(o) {
    return S.discursos
        .filter(d => d.oradorId ? d.oradorId === o.id : norm(d.nome).trim() === norm(o.nome).trim())
        .sort((a, b) => b.data.localeCompare(a.data));
}
function infoOrador(o) {
    const ds = discursosDe(o);
    const feitos = ds.filter(contaComoFeito);
    return { ds, feitos, ultimo: feitos[0]?.data || null };
}

export const discDoDia = date => S.discursos
    .filter(d => d.data === date)
    .sort((a, b) => (a.slot || 1) - (b.slot || 1) || (a.status === 'recusou') - (b.status === 'recusou'));

const nomeCurto = s => {
    const p = String(s || '').trim().split(/\s+/);
    return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0];
};
const linkFonte = f => /^https?:\/\//i.test(f || '')
    ? `<a href="${esc(f)}" target="_blank" rel="noopener" title="${esc(f)}"><i class="fas fa-up-right-from-square"></i> fonte</a>`
    : (f ? `<span class="muted">(${esc(f)})</span>` : '');

// --- Integração com a ata ---

export function nomesDoDia(date) {
    const r = { 1: [], 2: [], 3: [] };
    discDoDia(date).filter(vaiParaAta).forEach(d => (r[d.slot] || r[1]).push(d.nome));
    return { primeiro_orador: r[1].join(' e '), segundo_orador: r[2].join(' e '), ultimo_orador: r[3].join(' e ') };
}

// Atualiza a ata sacramental daquele domingo (se existir) com os oradores confirmados
function syncAta(date) {
    const nomes = nomesDoDia(date);
    S.atas
        .filter(a => a.data === date && a.tipo_ata !== 'testemunho')
        .forEach(a => {
            if (Object.keys(nomes).some(k => (a[k] || '') !== nomes[k])) {
                col.atas.doc(a.id).set({ ...nomes, updatedAt: TS() }, { merge: true })
                    .catch(err => { console.error(err); showToast('Erro ao atualizar a ata com os oradores.', 'error'); });
            }
        });
    const f = formAtual();
    if (f.data === date && f.tipo === 'sacramental') {
        if (!S.isDirty) preencherOradores(nomes);
        else showToast('Os oradores deste domingo mudaram. A ata aberta tem alterações não salvas: confira os oradores antes de salvar.', 'info', 6000);
    }
}

// --- Carregamento ---

const carregou = { discursos: false, domingos: false };

function loadDiscursantes() {
    const onErr = err => { console.error(err); showToast('Erro ao carregar discursantes. Verifique seu acesso.', 'error', 6000); };
    col.oradores.onSnapshot(s => {
        S.oradores = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
        refreshDisc();
    }, onErr);
    col.discursos.onSnapshot(s => {
        S.discursos = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => d.data);
        carregou.discursos = true;
        S.discursosCarregados = carregou.discursos && carregou.domingos;
        pendingSync.forEach(syncAta);
        pendingSync.clear();
        refreshDisc();
    }, onErr);
    col.domingos.onSnapshot(s => {
        S.domingos = {};
        s.docs.forEach(d => { S.domingos[d.id] = d.data(); });
        carregou.domingos = true;
        S.discursosCarregados = carregou.discursos && carregou.domingos;
        refreshDisc();
    }, onErr);
}

function refreshDisc() {
    // Mantém os temas da semana (sem nomes) atualizados para a líder de música
    agendarSyncTemas(discDoDia, domTipo);
    renderCalendar();
    renderOradores();
    $('lista-oradores').innerHTML = S.oradores
        .filter(o => !o.indisponivel)
        .map(o => `<option value="${esc(o.nome)}">${esc(TIPOS[o.tipo] || '')}</option>`).join('');
    if (diaAtual) renderDia();
    if (pessoaAtual && !$('modal-pessoa').classList.contains('hidden')) renderHistorico();
}

// --- Calendário ---

const agora = new Date();
let calY = agora.getFullYear(), calM = agora.getMonth();
let calModo = window.innerWidth <= 700 ? 'semanas' : 'grade';   // no celular a lista de semanas é mais fácil de ler

function renderCalendar() {
    $('cal-titulo').textContent = `${MESES[calM]} ${calY}`;
    $('cal-modo').innerHTML = calModo === 'grade'
        ? '<i class="fas fa-list"></i> <span class="lbl">Semanas do mês</span>'
        : '<i class="fas fa-calendar"></i> <span class="lbl">Calendário</span>';
    if (calModo === 'grade') renderGrade(); else renderSemanas();
}

function renderGrade() {
    const first = new Date(calY, calM, 1);
    const start = new Date(calY, calM, 1 - first.getDay());
    const t = hoje();
    let html = DIAS.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        if (i % 7 === 0 && i > 0 && d.getMonth() !== calM) break;
        const iso = toISO(d);
        const fora = d.getMonth() !== calM;
        const dom = d.getDay() === 0 && !fora;
        let inner = '';
        if (dom) {
            const tipo = domTipo(iso);
            const ds = discDoDia(iso).filter(x => x.status !== 'recusou');
            if (tipo !== 'normal') inner += `<span class="dom-tag tag-${tipo}">${DOM_CURTO[tipo]}</span>`;
            inner += ds.map(x => `<span class="chip st-${effStatus(x)}" title="${esc(`${SLOTS[x.slot] || ''}: ${x.nome}${x.tema ? ' — ' + x.tema : ''} (${STATUS[effStatus(x)]})`)}">${esc(nomeCurto(x.nome))}</span>`).join('');
            if (ds.length) inner += `<span class="cal-count">${ds.length} <i class="fas fa-microphone"></i></span>`;
            if (tipo === 'normal' && !ds.length) inner += '<span class="cal-vazio">+ planejar</span>';
        }
        html += `<div class="cal-cell${fora ? ' out' : ''}${dom ? ' sunday' : ''}${iso === t ? ' today' : ''}"${dom ? ` data-date="${iso}"` : ''}><span class="cal-num">${d.getDate()}</span>${inner}</div>`;
    }
    $('cal-body').className = 'cal-grid';
    $('cal-body').innerHTML = html;
}

function renderSemanas() {
    const html = domingosDoMes(calY, calM).map((iso, i) => {
        const tipo = domTipo(iso);
        const ds = discDoDia(iso);
        const tempo = ds.filter(x => x.status !== 'recusou').reduce((s, x) => s + (+x.tempo || 0), 0);
        const nota = S.domingos[iso]?.nota;
        const linhas = ds.length
            ? ds.map(x => `<tr class="${x.status === 'recusou' ? 'riscado' : ''}">
                    <td>${SLOTS[x.slot] || ''}</td>
                    <td><strong>${esc(x.nome)}</strong><div>${esc(x.tema || 'Sem tema definido')} ${linkFonte(x.fonte)}</div></td>
                    <td style="white-space:nowrap">${x.tempo ? x.tempo + ' min' : ''}</td>
                    <td style="text-align:right"><span class="st-badge st-${effStatus(x)}">${STATUS[effStatus(x)]}</span></td>
                </tr>`).join('')
            : `<tr><td colspan="4" class="muted">${tipo === 'normal' ? 'Nenhum discursante planejado. Clique para planejar.' : 'Domingo sem discursantes.'}</td></tr>`;
        return `<div class="semana" data-date="${iso}">
            <div class="semana-head">
                <span>${i + 1}ª semana · <strong>${formatDate(iso)}</strong></span>
                <span class="dom-tag tag-${tipo}">${DOM_TIPOS[tipo]}</span>
                ${tempo ? `<span class="muted"><i class="far fa-clock"></i> ${tempo} min</span>` : ''}
                ${nota ? `<span class="muted">· ${esc(nota)}</span>` : ''}
            </div>
            <table class="disc-table">${linhas}</table>
        </div>`;
    }).join('');
    $('cal-body').className = 'semanas';
    $('cal-body').innerHTML = html;
}

function mudarMes(delta) {
    const d = new Date(calY, calM + delta, 1);
    calY = d.getFullYear(); calM = d.getMonth();
    renderCalendar();
}

// --- Imprimir mês ---

function imprimirMes() {
    const celula = (ds, slot) => ds.filter(x => x.slot === slot && x.status !== 'recusou')
        .map(x => `<b>${esc(x.nome)}</b>${effStatus(x) === 'convidado' ? ' <i>(a confirmar)</i>' : ''}${x.tema ? `<br><small>${esc(x.tema)}</small>` : ''}${x.tempo ? `<br><small>${x.tempo} min</small>` : ''}`)
        .join('<br>') || '—';
    const linhas = domingosDoMes(calY, calM).map(iso => {
        const tipo = domTipo(iso);
        const ds = discDoDia(iso);
        const nota = S.domingos[iso]?.nota ? `<br><small>${esc(S.domingos[iso].nota)}</small>` : '';
        if (tipo !== 'normal' && !ds.length) {
            return `<tr><td>${formatDate(iso)}</td><td colspan="3"><b>${DOM_TIPOS[tipo]}</b>${nota}</td></tr>`;
        }
        return `<tr><td>${formatDate(iso)}${tipo !== 'normal' ? `<br><small>${DOM_TIPOS[tipo]}</small>` : ''}${nota}</td><td>${celula(ds, 1)}</td><td>${celula(ds, 2)}</td><td>${celula(ds, 3)}</td></tr>`;
    }).join('');
    const titulo = `Discursantes — ${MESES[calM]} de ${calY}`;
    const w = window.open('', '_blank');
    if (!w) { showToast('Permita pop-ups neste site para imprimir.', 'error'); return; }
    w.document.write(`<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8"><title>${titulo}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #222; }
            h1 { font-size: 18px; margin: 0 0 4px; } p { margin: 0 0 16px; color: #666; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #bbb; padding: 8px; vertical-align: top; text-align: left; }
            th { background: #eef0f2; } td:first-child { white-space: nowrap; width: 1%; }
            small { color: #555; }
        </style></head><body>
        <h1>${titulo}</h1><p>Ala Vila Matilde · gerado em ${formatDate(hoje())}</p>
        <table><thead><tr><th>Domingo</th><th>1º orador</th><th>2º orador</th><th>Último orador</th></tr></thead><tbody>${linhas}</tbody></table>
        <script>window.onload = () => window.print();<\/script></body></html>`);
    w.document.close();
}

// --- Modal do domingo ---

let diaAtual = null;
let discEditId = null;

function abrirDia(date) {
    diaAtual = date;
    resetDiscForm();
    $('dia-tipo').value = domTipo(date);
    $('dia-nota').value = S.domingos[date]?.nota || '';
    renderDia();
    abrirModal('modal-dia');
}

function renderDia() {
    const d = parseISO(diaAtual);
    $('dia-titulo').textContent = `Domingo, ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
    const ds = discDoDia(diaAtual);
    if (!discEditId && !$('disc-nome').value.trim()) sugerirOrdem();
    const tempo = ds.filter(x => x.status !== 'recusou').reduce((s, x) => s + (+x.tempo || 0), 0);
    $('dia-tempo').innerHTML = tempo ? `<i class="far fa-clock"></i> ${tempo} min no total` : '';
    const tipo = domTipo(diaAtual);
    const avisoTipo = tipo !== 'normal' && ds.length
        ? `<div class="aviso warn" style="margin-bottom:8px;">Este domingo está marcado como <b>${DOM_TIPOS[tipo]}</b>, mas tem discursantes.</div>` : '';
    $('dia-lista').innerHTML = avisoTipo + (ds.length ? ds.map(x => `
        <div class="dia-item">
            <div class="dia-info">
                <div class="slot">${SLOTS[x.slot] || ''}${x.tempo ? ` · ${x.tempo} min` : ''}</div>
                <div style="font-weight:600;${x.status === 'recusou' ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(x.nome)}</div>
                <div class="tema">${esc(x.tema || 'Sem tema definido')} ${linkFonte(x.fonte)}</div>
            </div>
            <span class="st-badge st-${effStatus(x)}">${STATUS[effStatus(x)]}</span>
            <div class="dia-acoes">
                <button class="btn btn-secondary btn-icon" data-edit="${esc(x.id)}" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-icon" data-del="${esc(x.id)}" title="Remover"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('') : '<p class="muted">Nenhum discursante neste domingo ainda.</p>');
}

function salvarDomingo() {
    if (!diaAtual) return;
    const tipo = $('dia-tipo').value;
    const nota = $('dia-nota').value.trim();
    const padrao = parseISO(diaAtual).getDate() <= 7 ? 'jejum' : 'normal';
    const ref = col.domingos.doc(diaAtual);
    const p = (tipo === padrao && !nota) ? ref.delete() : ref.set({ tipo, nota });
    p.catch(err => { console.error(err); showToast('Erro ao salvar o tipo do domingo.', 'error'); });
}

// Sugere a próxima ordem livre (1º, 2º, último)
function sugerirOrdem() {
    const usados = new Set(diaAtual ? discDoDia(diaAtual).filter(x => x.status !== 'recusou').map(x => x.slot) : []);
    $('disc-slot').value = [1, 2, 3].find(s => !usados.has(s)) || 3;
}

function resetDiscForm() {
    discEditId = null;
    $('disc-nome').value = '';
    $('disc-tema').value = '';
    $('disc-fonte').value = '';
    $('disc-tempo').value = '';
    $('disc-status').value = 'convidado';
    sugerirOrdem();
    $('disc-form-titulo').textContent = 'Adicionar discursante';
    $('disc-salvar-txt').textContent = 'Adicionar';
    $('disc-cancelar').classList.add('hidden');
    $('disc-avisos').innerHTML = '';
}

function editarDisc(id) {
    const x = S.discursos.find(d => d.id === id);
    if (!x) return;
    discEditId = id;
    $('disc-nome').value = x.nome || '';
    $('disc-slot').value = x.slot || 1;
    $('disc-status').value = x.status || 'convidado';
    $('disc-tempo').value = x.tempo || '';
    $('disc-tema').value = x.tema || '';
    $('disc-fonte').value = x.fonte || '';
    $('disc-form-titulo').textContent = 'Editar discursante';
    $('disc-salvar-txt').textContent = 'Salvar alterações';
    $('disc-cancelar').classList.remove('hidden');
    atualizarAvisos();
    $('disc-nome').focus();
}

function atualizarAvisos() {
    const avisos = [];
    const nome = $('disc-nome').value.trim();
    const tema = $('disc-tema').value.trim();
    if (nome) {
        const o = findOrador(nome);
        if (o) {
            const info = infoOrador(o);
            const anteriores = info.feitos.filter(d => d.data < diaAtual && d.id !== discEditId);
            const ult = anteriores[0]?.data;
            if (o.indisponivel) avisos.push(['erro', `${esc(o.nome)} está marcado como indisponível${o.motivo ? ` (${esc(o.motivo)})` : ''}.`]);
            if (!ult) avisos.push(['', `${esc(o.nome)} nunca discursou.`]);
            else {
                const recente = diasEntre(ult, diaAtual) < 90;
                avisos.push([recente ? 'warn' : '', `Último discurso: ${formatDate(ult)} (${tempoTxt(ult)}) · ${anteriores.length} discurso(s) no total.`]);
            }
        } else {
            avisos.push(['', 'Pessoa fora da lista de oradores (ex.: visitante). Será salvo só com o nome.']);
        }
        const mesmoDia = discDoDia(diaAtual).find(d => d.id !== discEditId && d.status !== 'recusou' && norm(d.nome).trim() === norm(nome).trim());
        if (mesmoDia) avisos.push(['warn', 'Essa pessoa já está neste domingo.']);
    }
    if (tema.length >= 4) {
        const t = norm(tema).trim();
        const parecidos = S.discursos.filter(d => d.id !== discEditId && d.tema && d.status !== 'recusou'
            && diasEntre(d.data, diaAtual) <= 183
            && (norm(d.tema).trim() === t || (t.length >= 8 && (norm(d.tema).includes(t) || t.includes(norm(d.tema).trim())))))
            .sort((a, b) => b.data.localeCompare(a.data));
        if (parecidos.length) {
            const p = parecidos[0];
            avisos.push(['warn', `Tema parecido usado em ${formatDate(p.data)} por ${esc(p.nome)}: “${esc(p.tema)}”${parecidos.length > 1 ? ` (e mais ${parecidos.length - 1})` : ''}.`]);
        }
    }
    $('disc-avisos').innerHTML = avisos.map(([cls, txt]) => `<div class="aviso ${cls}">${txt}</div>`).join('');
}

function salvarDiscurso() {
    if (!diaAtual) return;
    const nomeDigitado = $('disc-nome').value.trim().replace(/\s+/g, ' ');
    if (!nomeDigitado) { showToast('Informe o nome do orador.', 'error'); $('disc-nome').focus(); return; }
    const o = findOrador(nomeDigitado);
    const dados = {
        data: diaAtual,
        nome: o ? o.nome : nomeDigitado,
        oradorId: o ? o.id : null,
        slot: +$('disc-slot').value,
        status: $('disc-status').value,
        tempo: $('disc-tempo').value ? +$('disc-tempo').value : null,
        tema: $('disc-tema').value.trim(),
        fonte: $('disc-fonte').value.trim(),
        updatedAt: TS()
    };
    const ref = discEditId ? col.discursos.doc(discEditId) : col.discursos.doc();
    if (!discEditId) dados.createdAt = TS();
    pendingSync.add(diaAtual);
    ref.set(dados, { merge: true }).catch(err => { console.error(err); showToast('Erro ao salvar discursante.', 'error', 5000); });
    showToast(discEditId ? 'Discursante atualizado.' : 'Discursante adicionado.');
    resetDiscForm();
}

function removerDisc(id) {
    const x = S.discursos.find(d => d.id === id);
    if (!x) return;
    if (!confirm(`Remover ${x.nome} de ${formatDate(x.data)}?\n\nSe a pessoa só recusou, prefira editar e marcar "Recusou" para manter o histórico.`)) return;
    pendingSync.add(x.data);
    col.discursos.doc(id).delete().catch(err => { console.error(err); showToast('Erro ao remover.', 'error'); });
    if (discEditId === id) resetDiscForm();
}

// --- Lista de oradores ---

function renderOradores() {
    const q = norm($('or-busca').value.trim());
    const filtro = $('or-filtro').value;
    const tipo = $('or-tipo').value;
    const ano = String(new Date().getFullYear());
    const infos = S.oradores.map(o => ({ o, ...infoOrador(o) }));

    const ativos = infos.filter(x => !x.o.indisponivel);
    const feitosAno = S.discursos.filter(d => contaComoFeito(d) && d.data.startsWith(ano));
    const jovensAno = feitosAno.filter(d => oradorPorId(d.oradorId)?.tipo === 'jovem').length;
    $('or-stats').innerHTML = `
        <div class="stat"><b>${ativos.length}</b><span>pessoas disponíveis</span></div>
        <div class="stat"><b>${feitosAno.length}</b><span>discursos em ${ano}</span></div>
        <div class="stat"><b>${ativos.filter(x => !x.ultimo).length}</b><span>nunca discursaram</span></div>
        <div class="stat"><b>${jovensAno}</b><span>discursos de jovens em ${ano}</span></div>`;

    let lista = infos.filter(x => (!q || norm(x.o.nome).includes(q)) && (!tipo || x.o.tipo === tipo));
    if (filtro === 'indisp') lista = lista.filter(x => x.o.indisponivel);
    else if (!q) lista = lista.filter(x => !x.o.indisponivel); // na busca por nome aparece todo mundo
    if (filtro === 'nunca') lista = lista.filter(x => !x.ultimo);
    if (filtro === '6m') lista = lista.filter(x => !x.ultimo || mesesDesde(x.ultimo) >= 6);
    if (filtro === '12m') lista = lista.filter(x => !x.ultimo || mesesDesde(x.ultimo) >= 12);

    $('or-count').textContent = `(${lista.length}${lista.length !== S.oradores.length ? ' de ' + S.oradores.length : ''})`;

    if (!S.oradores.length) {
        $('or-lista').innerHTML = '<p class="empty-msg">Nenhum orador cadastrado. Use "Adicionar" ou "Colar lista".</p>';
        return;
    }
    if (!lista.length) {
        $('or-lista').innerHTML = '<p class="empty-msg">Ninguém encontrado com esse filtro.</p>';
        return;
    }

    const item = x => {
        const info = x.ultimo
            ? `<div class="or-info${mesesDesde(x.ultimo) >= 12 ? ' alerta' : ''}">Último: ${formatDate(x.ultimo)} · ${tempoTxt(x.ultimo)} · ${x.feitos.length} discurso${x.feitos.length > 1 ? 's' : ''}</div>`
            : '<div class="or-info">Nunca discursou</div>';
        return `<div class="or-item${x.o.indisponivel ? ' indisp' : ''}" data-id="${esc(x.o.id)}">
            <div class="or-nome">${esc(x.o.nome)}
                <span class="tipo-badge tipo-${esc(x.o.tipo || 'adulto')}">${TIPOS[x.o.tipo] || 'Adulto'}</span>
                ${x.o.indisponivel ? `<span class="tipo-badge tipo-indisp">Indisponível${x.o.motivo ? ': ' + esc(x.o.motivo) : ''}</span>` : ''}
            </div>${info}</div>`;
    };

    const nunca = lista.filter(x => !x.ultimo);
    const ja = lista.filter(x => x.ultimo).sort((a, b) => a.ultimo.localeCompare(b.ultimo));
    let html = '';
    if (nunca.length) html += `<div class="or-grupo">Nunca discursaram (${nunca.length})</div>` + nunca.map(item).join('');
    if (ja.length) html += `<div class="or-grupo">Há mais tempo sem discursar primeiro (${ja.length})</div>` + ja.map(item).join('');
    $('or-lista').innerHTML = html;
}

// --- Modal da pessoa ---

let pessoaAtual = null;   // id, ou '' para nova

function abrirPessoa(id) {
    const o = id ? oradorPorId(id) : null;
    pessoaAtual = o ? o.id : '';
    $('p-titulo').textContent = o ? o.nome : 'Novo orador';
    $('p-nome').value = o?.nome || '';
    $('p-tipo').value = o?.tipo || 'adulto';
    $('p-indisp').checked = !!o?.indisponivel;
    $('p-motivo').value = o?.motivo || 'Pediu pausa';
    $('p-obs').value = o?.obs || '';
    $('p-motivo-wrap').classList.toggle('hidden', !o?.indisponivel);
    $('p-excluir').classList.toggle('hidden', !o);
    renderHistorico();
    abrirModal('modal-pessoa');
    if (!o) $('p-nome').focus();
}

function renderHistorico() {
    const o = pessoaAtual ? oradorPorId(pessoaAtual) : null;
    if (!o) { $('p-historico').innerHTML = ''; return; }
    const { ds, feitos, ultimo } = infoOrador(o);
    const ano = String(new Date().getFullYear());
    const noAno = feitos.filter(d => d.data.startsWith(ano)).length;
    const resumo = `
        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
            <div class="stat"><b>${feitos.length}</b><span>discursos no total</span></div>
            <div class="stat"><b>${noAno}</b><span>em ${ano}</span></div>
            <div class="stat"><b style="font-size:1rem;">${ultimo ? formatDate(ultimo) : '—'}</b><span>${ultimo ? tempoTxt(ultimo) : 'nunca discursou'}</span></div>
        </div>`;
    const tabela = ds.length
        ? `<table class="hist-table"><thead><tr><th>Data</th><th>Tema</th><th>Ordem</th><th>Situação</th></tr></thead><tbody>
            ${ds.map(d => `<tr data-date="${d.data}" title="Abrir este domingo">
                <td style="white-space:nowrap">${formatDate(d.data)}</td>
                <td>${esc(d.tema || '—')}</td>
                <td style="white-space:nowrap">${SLOTS[d.slot] || ''}</td>
                <td><span class="st-badge st-${effStatus(d)}">${STATUS[effStatus(d)]}</span></td>
            </tr>`).join('')}</tbody></table>`
        : '<p class="muted">Nenhum discurso registrado.</p>';
    $('p-historico').innerHTML = `<strong style="color:var(--primary-color);">Histórico</strong>${resumo}${tabela}`;
}

function salvarPessoa() {
    const nome = $('p-nome').value.trim().replace(/\s+/g, ' ');
    if (!nome) { showToast('Informe o nome.', 'error'); $('p-nome').focus(); return; }
    const dup = findOrador(nome);
    if (dup && dup.id !== pessoaAtual) { showToast('Já existe um orador com esse nome.', 'error'); return; }
    const indisp = $('p-indisp').checked;
    const dados = {
        nome,
        tipo: $('p-tipo').value,
        indisponivel: indisp,
        motivo: indisp ? $('p-motivo').value : '',
        obs: $('p-obs').value.trim(),
        updatedAt: TS()
    };
    const antigo = pessoaAtual ? oradorPorId(pessoaAtual) : null;
    const ref = pessoaAtual ? col.oradores.doc(pessoaAtual) : col.oradores.doc();
    if (!pessoaAtual) dados.createdAt = TS();

    const batch = db.batch();
    batch.set(ref, dados, { merge: true });
    // Nova pessoa: liga discursos antigos digitados com o mesmo nome. Nome alterado: atualiza nos discursos.
    S.discursos.forEach(d => {
        const ligado = antigo ? d.oradorId === antigo.id : (!d.oradorId && norm(d.nome).trim() === norm(nome).trim());
        if (!ligado) return;
        const upd = {};
        if (!antigo) upd.oradorId = ref.id;
        if (d.nome !== nome) upd.nome = nome;
        if (Object.keys(upd).length) {
            batch.set(col.discursos.doc(d.id), upd, { merge: true });
            if (upd.nome && d.data >= hoje()) pendingSync.add(d.data);
        }
    });
    batch.commit().catch(err => { console.error(err); showToast('Erro ao salvar orador.', 'error', 5000); });
    showToast(pessoaAtual ? 'Orador atualizado.' : 'Orador adicionado.');
    fecharModal('modal-pessoa');
}

function excluirPessoa() {
    const o = oradorPorId(pessoaAtual);
    if (!o) return;
    if (!confirm(`Excluir ${o.nome} da lista?\n\nO histórico de discursos continua salvo com o nome. Se a pessoa só não pode discursar agora, prefira marcar "Indisponível".`)) return;
    const batch = db.batch();
    batch.delete(col.oradores.doc(o.id));
    S.discursos.filter(d => d.oradorId === o.id).forEach(d => batch.set(col.discursos.doc(d.id), { oradorId: null }, { merge: true }));
    batch.commit().catch(err => { console.error(err); showToast('Erro ao excluir.', 'error'); });
    showToast('Orador excluído.');
    fecharModal('modal-pessoa');
}

async function colarLista() {
    const tipo = $('colar-tipo').value;
    const vistos = new Set(S.oradores.map(o => norm(o.nome).trim()));
    const novos = [];
    let repetidos = 0;
    $('colar-texto').value.split('\n')
        .map(s => s.replace(/^[\s\-•*\d.)]+/, '').trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .forEach(nome => {
            const n = norm(nome);
            if (vistos.has(n)) { repetidos++; return; }
            vistos.add(n);
            novos.push(nome);
        });
    if (!novos.length) { showToast(repetidos ? 'Todos esses nomes já estão na lista.' : 'Cole pelo menos um nome.', 'error'); return; }
    for (let i = 0; i < novos.length; i += 400) {
        const batch = db.batch();
        novos.slice(i, i + 400).forEach(nome => {
            const ref = col.oradores.doc();
            batch.set(ref, { nome, tipo, indisponivel: false, motivo: '', obs: '', createdAt: TS(), updatedAt: TS() });
            S.discursos.filter(d => !d.oradorId && norm(d.nome).trim() === norm(nome)).forEach(d => batch.set(col.discursos.doc(d.id), { oradorId: ref.id }, { merge: true }));
        });
        batch.commit().catch(err => { console.error(err); showToast('Erro ao adicionar a lista.', 'error', 5000); });
    }
    showToast(`${novos.length} adicionado(s)${repetidos ? `, ${repetidos} já existia(m)` : ''}.`);
    fecharModal('modal-colar');
}

// --- Inicialização ---

export function initDiscursantes() {
    const tipoOptions = Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('p-tipo').innerHTML = tipoOptions;
    $('colar-tipo').innerHTML = tipoOptions;
    $('or-tipo').innerHTML = '<option value="">Todos os tipos</option>' + tipoOptions;
    $('dia-tipo').innerHTML = Object.entries(DOM_TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

    // Calendário
    $('cal-prev').addEventListener('click', () => mudarMes(-1));
    $('cal-next').addEventListener('click', () => mudarMes(1));
    $('cal-hoje').addEventListener('click', () => { calY = agora.getFullYear(); calM = agora.getMonth(); renderCalendar(); });
    const alternarModo = () => { calModo = calModo === 'grade' ? 'semanas' : 'grade'; renderCalendar(); };
    $('cal-titulo').addEventListener('click', alternarModo);
    $('cal-modo').addEventListener('click', alternarModo);
    $('cal-body').addEventListener('click', e => {
        if (e.target.closest('a')) return;
        const el = e.target.closest('[data-date]');
        if (el) abrirDia(el.dataset.date);
    });
    $('cal-imprimir').addEventListener('click', imprimirMes);

    // Modal do domingo
    $('dia-tipo').addEventListener('change', salvarDomingo);
    $('dia-nota').addEventListener('change', salvarDomingo);
    $('modal-dia').addEventListener('modal-antes-fechar', () => {
        // Salva a nota se o modal foi fechado antes do campo perder o foco (ex.: tecla Esc)
        if (diaAtual && $('dia-nota').value.trim() !== (S.domingos[diaAtual]?.nota || '')) salvarDomingo();
    });
    $('modal-dia').addEventListener('modal-fechado', () => { diaAtual = null; });
    ['disc-nome', 'disc-tema'].forEach(id => $(id).addEventListener('input', atualizarAvisos));
    $('disc-salvar').addEventListener('click', salvarDiscurso);
    $('disc-cancelar').addEventListener('click', resetDiscForm);
    ['disc-nome', 'disc-tema', 'disc-fonte', 'disc-tempo'].forEach(id => $(id).addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); salvarDiscurso(); }
    }));
    $('dia-lista').addEventListener('click', e => {
        const ed = e.target.closest('[data-edit]');
        const del = e.target.closest('[data-del]');
        if (ed) editarDisc(ed.dataset.edit);
        else if (del) removerDisc(del.dataset.del);
    });

    // Oradores
    ['or-busca', 'or-filtro', 'or-tipo'].forEach(id => $(id).addEventListener('input', renderOradores));
    $('or-lista').addEventListener('click', e => {
        const el = e.target.closest('.or-item');
        if (el) abrirPessoa(el.dataset.id);
    });
    $('p-indisp').addEventListener('change', () => $('p-motivo-wrap').classList.toggle('hidden', !$('p-indisp').checked));
    $('p-historico').addEventListener('click', e => {
        const tr = e.target.closest('tr[data-date]');
        if (!tr) return;
        const d = parseISO(tr.dataset.date);
        calY = d.getFullYear(); calM = d.getMonth();
        renderCalendar();
        fecharModal('modal-pessoa');
        abrirDia(tr.dataset.date);
    });
    $('modal-pessoa').addEventListener('modal-fechado', () => { pessoaAtual = null; });
    $('or-add').addEventListener('click', () => abrirPessoa(''));
    $('p-salvar').addEventListener('click', salvarPessoa);
    $('p-excluir').addEventListener('click', excluirPessoa);
    $('p-nome').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); salvarPessoa(); } });
    $('or-colar').addEventListener('click', () => {
        $('colar-texto').value = '';
        $('colar-tipo').value = 'adulto';
        abrirModal('modal-colar');
        $('colar-texto').focus();
    });
    $('colar-salvar').addEventListener('click', colarLista);

    renderCalendar();
    loadDiscursantes();
}
