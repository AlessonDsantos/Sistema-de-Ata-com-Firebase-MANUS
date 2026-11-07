// Chamados: acompanhamento por etapas (em oração → entrevista → aceito → apoiado → designado)
import { S } from './state.js';
import { $, esc, norm, hoje, formatDate, showToast, abrirModal, fecharModal } from './util.js';
import {
    aoMudar, ETAPAS, ORDEM_ETAPAS, TIPOS_CHAMADO, ENTREVISTADORES, STATUS_ENT, proximoDomingo, ehDesob, descChamado,
    entrevistaDoChamado, quandoTxt, nomesConhecidos, criarChamado, enviarParaEntrevista, mudarEtapa,
    salvarChamado, excluirChamado, concluirEntrevista
} from './bispado-dados.js';

let editId = null;
let mostrarConcluidos = false;

const DICA = {
    oracao: 'Orar para saber se deve ter um chamado e qual.',
    convite: 'Já está na fila de entrevistas.',
    aceito: 'Entra na ata do domingo do apoio.',
    apoiado: 'Falta designar.',
    designado: '',
    recusado: ''
};

function card(c) {
    const e = entrevistaDoChamado(c);
    let info = '', botoes = '';
    switch (c.etapa) {
        case 'oracao':
            info = c.reuniaoData ? `Desde ${formatDate(c.reuniaoData)}` : '';
            botoes = `<button class="btn btn-primary btn-sm" data-decidir="${esc(c.id)}">Decidido → entrevista</button>`;
            break;
        case 'convite':
            info = !e ? 'Sem entrevista' : e.status === 'marcada'
                ? `Entrevista ${quandoTxt(e.quando)} · ${ENTREVISTADORES[e.entrevistador] || ''}` : `Entrevista: ${(STATUS_ENT[e.status] || '').toLowerCase()}`;
            botoes = `<button class="btn btn-success btn-sm" data-aceitou="${esc(c.id)}">Aceitou</button>
                      <button class="btn btn-light btn-sm" data-recusou="${esc(c.id)}">Não aceitou</button>`;
            break;
        case 'aceito':
            info = `${ehDesob(c) ? 'Desobrigação' : 'Apoio'} em <input type="date" class="ch-dom" data-dom="${esc(c.id)}" value="${esc(c.domingoApoio || '')}">`;
            botoes = `<button class="btn btn-light btn-sm" data-apoiado="${esc(c.id)}" title="Normalmente é marcado sozinho pela ata do domingo">${ehDesob(c) ? 'Desobrigado' : 'Apoiado'}</button>`;
            break;
        case 'apoiado':
            info = c.apoiadoEm ? `Apoiado em ${formatDate(c.apoiadoEm)}` : '';
            botoes = `<button class="btn btn-success btn-sm" data-designado="${esc(c.id)}">Designado</button>`;
            break;
        case 'designado':
            info = c.apoiadoEm ? `${ehDesob(c) ? 'Desobrigado' : 'Apoiado'} em ${formatDate(c.apoiadoEm)}` : '';
            break;
        case 'recusado':
            info = 'Não aceitou';
            botoes = `<button class="btn btn-light btn-sm" data-reabrir="${esc(c.id)}">Voltar para oração</button>`;
            break;
    }
    return `<div class="ch-card etapa-borda-${c.etapa}">
        <div class="ch-topo" data-editar-ch="${esc(c.id)}" title="Editar">
            <b>${esc(c.pessoa)}</b>
            <span class="ch-tipo">${ehDesob(c) ? 'Desobrigação' : c.tipo === 'mudanca' ? 'Mudança' : 'Novo'}</span>
        </div>
        <div class="ch-desc">${esc(ehDesob(c) ? (c.chamadoAtual || '') : (c.chamado || 'Chamado a definir'))}</div>
        ${c.chamadoAtual && !ehDesob(c) ? `<div class="ch-sai">Sai de: ${esc(c.chamadoAtual)}</div>` : ''}
        ${info ? `<div class="ch-info">${info}</div>` : ''}
        ${botoes ? `<div class="ch-bts">${botoes}</div>` : ''}
    </div>`;
}

function render() {
    const q = norm($('ch-busca').value.trim());
    const lista = S.chamados.filter(c => !q || norm(`${c.pessoa} ${c.chamado} ${c.chamadoAtual}`).includes(q));
    const limite = new Date(); limite.setDate(limite.getDate() - 60);
    const recente = c => (c.historico?.slice(-1)[0]?.data || '') >= `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, '0')}-${String(limite.getDate()).padStart(2, '0')}`;

    const colunas = [...ORDEM_ETAPAS, 'recusado'].map(et => {
        let itens = lista.filter(c => c.etapa === et);
        let ocultos = 0;
        if ((et === 'designado' || et === 'recusado') && !mostrarConcluidos && !q) {
            const vis = itens.filter(recente);
            ocultos = itens.length - vis.length;
            itens = vis;
        }
        itens.sort((a, b) => (a.domingoApoio || a.reuniaoData || '').localeCompare(b.domingoApoio || b.reuniaoData || ''));
        return `<div class="kb-col">
            <div class="kb-tit etapa-${et}">${ETAPAS[et]} <span>${itens.length}</span></div>
            ${DICA[et] ? `<div class="kb-dica">${DICA[et]}</div>` : ''}
            ${itens.map(card).join('') || '<div class="pauta-vazio">—</div>'}
            ${ocultos ? `<button class="link-btn" data-mostrar-todos>Mostrar mais ${ocultos} antigos</button>` : ''}
        </div>`;
    }).join('');
    $('ch-kanban').innerHTML = colunas;
    $('lista-pessoas').innerHTML = nomesConhecidos().map(n => `<option value="${esc(n)}">`).join('');
}

// --- Modal ---

export function abrirChamado(id) {
    const c = id ? S.chamados.find(x => x.id === id) : null;
    editId = c ? c.id : null;
    $('mc-titulo').textContent = c ? c.pessoa : 'Novo chamado';
    $('mc-pessoa').value = c?.pessoa || '';
    $('mc-tipo').value = c?.tipo || 'chamado';
    $('mc-novo').value = c?.chamado || '';
    $('mc-atual').value = c?.chamadoAtual || '';
    $('mc-etapa').value = c?.etapa || 'oracao';
    $('mc-dom').value = c?.domingoApoio || '';
    $('mc-etapa-wrap').classList.toggle('hidden', !c);
    $('mc-decidido-wrap').classList.toggle('hidden', !!c);
    $('mc-decidido').checked = false;
    $('mc-excluir').classList.toggle('hidden', !c);
    $('mc-hist').innerHTML = c?.historico?.length
        ? `<div class="muted" style="margin-top:1rem;font-size:0.8rem;">${c.historico.map(h => `${formatDate(h.data)}: ${ETAPAS[h.etapa] || h.etapa}${h.por ? ` (${esc(h.por)})` : ''}`).join('<br>')}</div>` : '';
    ajustarTipo();
    abrirModal('modal-chamado');
}

function ajustarTipo() {
    const t = $('mc-tipo').value;
    $('mc-novo-wrap').classList.toggle('hidden', t === 'desobrigacao');
    $('mc-atual-wrap').classList.toggle('hidden', t === 'chamado');
    $('mc-dom-wrap').classList.toggle('hidden', !['aceito', 'apoiado', 'designado'].includes($('mc-etapa').value) || !editId);
}

function salvar() {
    const pessoa = $('mc-pessoa').value.trim().replace(/\s+/g, ' ');
    const tipo = $('mc-tipo').value;
    const chamado = $('mc-novo').value.trim();
    const chamadoAtual = $('mc-atual').value.trim();
    if (!pessoa) { showToast('Informe a pessoa.', 'error'); return; }
    if (tipo !== 'chamado' && !chamadoAtual) { showToast('Informe o chamado atual.', 'error'); return; }
    if (!editId) {
        if (tipo !== 'desobrigacao' && !chamado && $('mc-decidido').checked) { showToast('Informe o chamado decidido.', 'error'); return; }
        criarChamado({ pessoa, tipo, chamado, chamadoAtual, decidido: $('mc-decidido').checked });
        fecharModal('modal-chamado');
        return;
    }
    const c = S.chamados.find(x => x.id === editId);
    const etapa = $('mc-etapa').value;
    const dados = { pessoa, tipo, chamado: tipo === 'desobrigacao' ? '' : chamado, chamadoAtual: tipo === 'chamado' ? '' : chamadoAtual, domingoApoio: $('mc-dom').value };
    salvarChamado(editId, dados).then(() => {
        if (!c || etapa === c.etapa) return;
        if (etapa === 'convite' && !entrevistaDoChamado(c)) enviarParaEntrevista({ ...c, ...dados });
        else mudarEtapa({ ...c, ...dados }, etapa);
    });
    showToast('Chamado atualizado.');
    fecharModal('modal-chamado');
}

function aceitou(c, sim) {
    const e = entrevistaDoChamado(c);
    if (e && e.status !== 'realizada') concluirEntrevista(e, sim ? 'aceitou' : 'recusou');
    else mudarEtapa(c, sim ? 'aceito' : 'recusado');
}

export function initChamados() {
    const opts = Object.entries(TIPOS_CHAMADO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('mc-tipo').innerHTML = opts;
    $('mc-etapa').innerHTML = Object.entries(ETAPAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    $('mc-tipo').addEventListener('change', ajustarTipo);
    $('mc-etapa').addEventListener('change', ajustarTipo);
    $('mc-salvar').addEventListener('click', salvar);
    $('mc-excluir').addEventListener('click', () => {
        const c = S.chamados.find(x => x.id === editId);
        if (c && confirm(`Excluir o registro de ${c.pessoa}?\n\nA entrevista ligada a ele (se ainda não foi feita) também sai da fila.`)) { excluirChamado(c); fecharModal('modal-chamado'); }
    });
    $('modal-chamado').addEventListener('modal-fechado', () => { editId = null; });
    $('ch-novo').addEventListener('click', () => abrirChamado(null));
    $('ch-busca').addEventListener('input', render);

    $('ch-kanban').addEventListener('change', e => {
        const i = e.target.closest('[data-dom]');
        if (!i) return;
        const c = S.chamados.find(x => x.id === i.dataset.dom);
        if (c && i.value) {
            if (new Date(i.value + 'T12:00').getDay() !== 0) showToast('Atenção: a data escolhida não é um domingo.', 'info', 4000);
            salvarChamado(c.id, { domingoApoio: i.value });
        }
    });
    $('ch-kanban').addEventListener('click', e => {
        const g = s => e.target.closest(s);
        const ch = id => S.chamados.find(x => x.id === id);
        let el;
        if (g('input')) return;
        if ((el = g('[data-decidir]'))) { const c = ch(el.dataset.decidir); if (c) { if (!ehDesob(c) && !c.chamado) abrirChamado(c.id); else enviarParaEntrevista(c); } }
        else if ((el = g('[data-aceitou]'))) { const c = ch(el.dataset.aceitou); if (c) aceitou(c, true); }
        else if ((el = g('[data-recusou]'))) { const c = ch(el.dataset.recusou); if (c && confirm(`${c.pessoa} não aceitou?`)) aceitou(c, false); }
        else if ((el = g('[data-apoiado]'))) { const c = ch(el.dataset.apoiado); if (c) mudarEtapa(c, 'apoiado', { apoiadoEm: c.domingoApoio && c.domingoApoio <= hoje() ? c.domingoApoio : hoje() }); }
        else if ((el = g('[data-designado]'))) { const c = ch(el.dataset.designado); if (c) mudarEtapa(c, 'designado'); }
        else if ((el = g('[data-reabrir]'))) { const c = ch(el.dataset.reabrir); if (c) mudarEtapa(c, 'oracao', { domingoApoio: '' }); }
        else if (g('[data-mostrar-todos]')) { mostrarConcluidos = true; render(); }
        else if ((el = g('[data-editar-ch]'))) abrirChamado(el.dataset.editarCh);
    });

    aoMudar(render);
    render();
}
