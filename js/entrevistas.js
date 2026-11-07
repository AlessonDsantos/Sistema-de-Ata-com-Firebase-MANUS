// Entrevistas: fila de quem precisa ser entrevistado.
// Guarda só tipo, motivo curto, quem entrevista, data e situação. Nunca o conteúdo da entrevista.
import { S } from './state.js';
import { $, esc, norm, hoje, formatDate, showToast, abrirModal, fecharModal } from './util.js';
import {
    aoMudar, TIPOS_ENT, ENTREVISTADORES, STATUS_ENT, quandoTxt, nomesConhecidos,
    salvarEntrevista, concluirEntrevista, cancelarEntrevista, excluirEntrevista
} from './bispado-dados.js';

let editId = null;
let resultadoId = null;

function card(e) {
    const atrasada = e.status === 'marcada' && e.quando && e.quando.slice(0, 10) < hoje();
    let botoes = '';
    if (e.status === 'pendente') botoes = `<button class="btn btn-primary btn-sm" data-ent="${esc(e.id)}">Marcar</button>`;
    else if (e.status === 'marcada') botoes = `<button class="btn btn-success btn-sm" data-realizada="${esc(e.id)}">Realizada</button>
        <button class="btn btn-light btn-sm" data-ent="${esc(e.id)}">Remarcar</button>`;
    const res = e.resultado === 'aceitou' ? ' · aceitou' : e.resultado === 'recusou' ? ' · não aceitou' : '';
    return `<div class="ent-card${atrasada ? ' atrasada' : ''}">
        <div class="ent-quando">${e.status === 'marcada' ? esc(quandoTxt(e.quando)) : e.status === 'realizada' ? `Feita ${formatDate(e.realizadaEm || '')}` : '<span class="muted">a marcar</span>'}</div>
        <div class="ent-info" data-ent="${esc(e.id)}">
            <b>${esc(e.pessoa)}</b>
            <div class="ent-sub"><span class="ent-tipo">${TIPOS_ENT[e.tipo] || e.tipo}</span>${e.motivo && e.motivo !== TIPOS_ENT[e.tipo] ? ' · ' + esc(e.motivo) : ''}</div>
            <div class="ent-sub"><i class="fas fa-user-tie"></i> ${ENTREVISTADORES[e.entrevistador] || 'Qualquer do bispado'}${res}${atrasada ? ' · <b>a data já passou</b>' : ''}</div>
        </div>
        <div class="ent-bts">${botoes}</div>
    </div>`;
}

function render() {
    const q = norm($('ent-busca').value.trim());
    const quem = $('ent-filtro').value;
    const lista = S.entrevistas.filter(e => (!q || norm(`${e.pessoa} ${e.motivo}`).includes(q)) && (!quem || e.entrevistador === quem || (quem !== 'qualquer' && e.entrevistador === 'qualquer')));
    const lim = new Date(); lim.setDate(lim.getDate() - 30);
    const limISO = `${lim.getFullYear()}-${String(lim.getMonth() + 1).padStart(2, '0')}-${String(lim.getDate()).padStart(2, '0')}`;
    const grupos = [
        ['A marcar', lista.filter(e => e.status === 'pendente').sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))],
        ['Marcadas', lista.filter(e => e.status === 'marcada').sort((a, b) => (a.quando || '').localeCompare(b.quando || ''))],
        ['Realizadas nos últimos 30 dias', lista.filter(e => e.status === 'realizada' && (e.realizadaEm || '') >= limISO).sort((a, b) => (b.realizadaEm || '').localeCompare(a.realizadaEm || ''))]
    ];
    $('ent-lista').innerHTML = grupos.map(([t, itens]) => `<div class="or-grupo">${t} (${itens.length})</div>` +
        (itens.length ? itens.map(card).join('') : '<p class="muted" style="margin-bottom:0.5rem;">Nenhuma.</p>')).join('');
    const pend = S.entrevistas.filter(e => e.status === 'pendente').length;
    $('badge-entrevistas').textContent = pend;
    $('badge-entrevistas').classList.toggle('hidden', !pend);
    $('lista-pessoas').innerHTML = nomesConhecidos().map(n => `<option value="${esc(n)}">`).join('');
}

// --- Modal: nova / marcar / editar ---

export function abrirEntrevista(id) {
    const e = id ? S.entrevistas.find(x => x.id === id) : null;
    editId = e ? e.id : null;
    $('me-titulo').textContent = e ? `Entrevista · ${e.pessoa}` : 'Nova entrevista';
    $('me-pessoa').value = e?.pessoa || '';
    $('me-tipo').value = e?.tipo || 'templo';
    $('me-motivo').value = e?.motivo || '';
    $('me-quem').value = e?.entrevistador || 'qualquer';
    $('me-quando').value = e?.quando || '';
    const doChamado = !!e?.chamadoId;
    ['me-pessoa', 'me-tipo', 'me-motivo'].forEach(i => { $(i).disabled = doChamado; });
    $('me-chamado-aviso').classList.toggle('hidden', !doChamado);
    $('me-excluir').classList.toggle('hidden', !e);
    $('me-cancelar').classList.toggle('hidden', !e || e.status === 'realizada' || e.status === 'cancelada');
    abrirModal('modal-ent');
    (e ? $('me-quando') : $('me-pessoa')).focus();
}

function salvar() {
    const pessoa = $('me-pessoa').value.trim().replace(/\s+/g, ' ');
    if (!pessoa) { showToast('Informe a pessoa.', 'error'); return; }
    const e = editId ? S.entrevistas.find(x => x.id === editId) : null;
    const dados = { entrevistador: $('me-quem').value, quando: $('me-quando').value };
    if (!e?.chamadoId) Object.assign(dados, { pessoa, tipo: $('me-tipo').value, motivo: $('me-motivo').value.trim() });
    if (e?.status === 'realizada') dados.status = 'realizada';
    else dados.status = dados.quando ? 'marcada' : 'pendente';
    salvarEntrevista(editId, dados);
    showToast(dados.status === 'marcada' ? `Entrevista marcada: ${quandoTxt(dados.quando)}` : 'Entrevista salva.');
    fecharModal('modal-ent');
}

// --- Resultado (só para chamados/desobrigações: a pessoa aceitou?) ---

export function marcarRealizada(id) {
    const e = S.entrevistas.find(x => x.id === id);
    if (!e) return;
    if (!e.chamadoId) { concluirEntrevista(e, null); showToast('Entrevista realizada.'); return; }
    resultadoId = id;
    $('mr-pergunta').textContent = `${e.pessoa} aceitou${e.tipo === 'desobrigacao' ? ' a desobrigação' : ' o chamado'}?`;
    $('mr-motivo').textContent = e.motivo || '';
    abrirModal('modal-resultado');
}

export function initEntrevistas() {
    $('me-tipo').innerHTML = Object.entries(TIPOS_ENT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('me-quem').innerHTML = Object.entries(ENTREVISTADORES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('ent-filtro').innerHTML = '<option value="">Todos os entrevistadores</option>' + Object.entries(ENTREVISTADORES).filter(([k]) => k !== 'qualquer').map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('ent-nova').addEventListener('click', () => abrirEntrevista(null));
    $('ent-busca').addEventListener('input', render);
    $('ent-filtro').addEventListener('change', render);
    $('ent-lista').addEventListener('click', e => {
        const r = e.target.closest('[data-realizada]');
        if (r) return marcarRealizada(r.dataset.realizada);
        const el = e.target.closest('[data-ent]');
        if (el) abrirEntrevista(el.dataset.ent);
    });
    $('me-salvar').addEventListener('click', salvar);
    $('me-cancelar').addEventListener('click', () => {
        const e = S.entrevistas.find(x => x.id === editId);
        if (e && confirm(`Cancelar a entrevista de ${e.pessoa}?`)) { cancelarEntrevista(e); fecharModal('modal-ent'); }
    });
    $('me-excluir').addEventListener('click', () => {
        const e = S.entrevistas.find(x => x.id === editId);
        if (e && confirm(`Excluir a entrevista de ${e.pessoa}?`)) { excluirEntrevista(e); fecharModal('modal-ent'); }
    });
    $('modal-ent').addEventListener('modal-fechado', () => { editId = null; });
    $('modal-resultado').addEventListener('click', ev => {
        const b = ev.target.closest('[data-res]');
        if (!b) return;
        const e = S.entrevistas.find(x => x.id === resultadoId);
        if (e) {
            const r = b.dataset.res || null;
            concluirEntrevista(e, r);
            showToast(r === 'aceitou' ? 'Aceitou: vai para a lista de apoios do próximo domingo.' : r === 'recusou' ? 'Registrado: não aceitou.' : 'Entrevista realizada.');
        }
        fecharModal('modal-resultado');
    });
    $('modal-resultado').addEventListener('modal-fechado', () => { resultadoId = null; });

    aoMudar(render);
    render();
}
