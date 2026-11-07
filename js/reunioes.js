// Reuniões do bispado: pauta automática + notas (assuntos gerais, ações e chamados)
import { S } from './state.js';
import { $, esc, hoje, formatDate, dataPorExtenso, showToast } from './util.js';
import {
    aoMudar, ETAPAS, TIPOS_CHAMADO, TIPOS_ENT, ENTREVISTADORES, STATUS_ENT, proximoDomingo, somaDias, ehDesob, descChamado,
    entrevistaDoChamado, acaoAtrasada, quandoTxt, nomesConhecidos,
    criarChamado, enviarParaEntrevista, mudarEtapa, criarAcao, marcarAcao, excluirAcao,
    novaReuniao, salvarReuniao, excluirReuniao, concluirEntrevista
} from './bispado-dados.js';
import { DIAS_ANUNCIO } from './ata-auto.js';
import { abrirChamado } from './chamados.js';
import { abrirEntrevista, marcarRealizada } from './entrevistas.js';
import { ORGS, horario } from './agenda-core.js';

let atualId = null;
let timerSalvar = null;

// =====================================================================
// Pauta automática
// =====================================================================

function secao(titulo, icone, itens, vazio) {
    return `<div class="pauta-sec">
        <div class="pauta-tit"><i class="fas ${icone}"></i> ${titulo} ${itens.length ? `<span class="pauta-n">${itens.length}</span>` : ''}</div>
        ${itens.length ? itens.join('') : `<div class="pauta-vazio">${vazio}</div>`}
    </div>`;
}

const linhaChamado = (c, extra = '', botoes = '') => `<div class="pauta-item" data-ch="${esc(c.id)}">
    <div class="pauta-info"><b>${esc(c.pessoa)}</b> <span class="muted">· ${esc(descChamado(c))}</span>${extra ? `<div class="pauta-sub">${extra}</div>` : ''}</div>
    <div class="pauta-bts">${botoes}</div></div>`;

function renderPauta() {
    const t = hoje();
    const dom = proximoDomingo(t);
    $('pauta-data').textContent = `atualizada em ${formatDate(t)}`;

    // 1. Ações pendentes (atrasadas primeiro)
    const acoes = S.acoes.filter(a => !a.feita)
        .sort((a, b) => (acaoAtrasada(b) - acaoAtrasada(a)) || (a.prazo || '9').localeCompare(b.prazo || '9'));
    const itAcoes = acoes.map(a => `<label class="pauta-item acao${acaoAtrasada(a) ? ' atrasada' : ''}">
        <input type="checkbox" data-acao="${esc(a.id)}">
        <div class="pauta-info">${esc(a.descricao)}
            <div class="pauta-sub">${a.responsavel ? `<i class="fas fa-user"></i> ${esc(a.responsavel)} · ` : ''}${a.prazo ? `prazo ${formatDate(a.prazo)}${acaoAtrasada(a) ? ' · <b>atrasada</b>' : ''}` : 'sem prazo'}</div>
        </div></label>`);

    // 2. Em oração
    const itOracao = S.chamados.filter(c => c.etapa === 'oracao').map(c =>
        linhaChamado(c, c.reuniaoData ? `desde ${formatDate(c.reuniaoData)}` : '',
            `<button class="btn btn-primary btn-sm" data-decidir="${esc(c.id)}">Decidido → entrevista</button>`));

    // 3. Aguardando entrevista / resposta
    const itConvite = S.chamados.filter(c => c.etapa === 'convite').map(c => {
        const e = entrevistaDoChamado(c);
        const info = !e ? 'sem entrevista' : e.status === 'marcada'
            ? `entrevista ${quandoTxt(e.quando)} · ${ENTREVISTADORES[e.entrevistador] || ''}` : `entrevista ${STATUS_ENT[e.status]?.toLowerCase() || ''}`;
        return linhaChamado(c, info,
            `<button class="btn btn-success btn-sm" data-aceitou="${esc(c.id)}">Aceitou</button>
             <button class="btn btn-light btn-sm" data-recusou="${esc(c.id)}">Não aceitou</button>`);
    });

    // 4. Apoios e desobrigações (aceitos)
    const aceitos = S.chamados.filter(c => c.etapa === 'aceito').sort((a, b) => (a.domingoApoio || '').localeCompare(b.domingoApoio || ''));
    const itApoio = aceitos.map(c => linhaChamado(c,
        c.domingoApoio ? `${ehDesob(c) ? 'desobrigação' : 'apoio'} em ${formatDate(c.domingoApoio)}${c.domingoApoio === dom ? ' (próximo domingo)' : ''}` : 'domingo do apoio não definido',
        `<button class="btn btn-light btn-sm" data-editar-ch="${esc(c.id)}">Alterar domingo</button>`));

    // 5. Designações pendentes
    const itDesig = S.chamados.filter(c => c.etapa === 'apoiado' && !ehDesob(c)).map(c =>
        linhaChamado(c, c.apoiadoEm ? `apoiado em ${formatDate(c.apoiadoEm)}` : '',
            `<button class="btn btn-success btn-sm" data-designado="${esc(c.id)}">Designado</button>`));

    // 6. Entrevistas: a marcar, marcadas (vencidas em destaque) e realizadas desde a última reunião
    const entHTML = renderEntrevistasPauta(t);

    // 7. Atividades das próximas 3 semanas
    const fim = somaDias(t, DIAS_ANUNCIO);
    const itAtiv = Object.values(S.agenda).filter(a => a.data >= t && a.data <= fim).sort((a, b) => a.data.localeCompare(b.data))
        .map(a => `<div class="pauta-item"><div class="pauta-info"><b>${formatDate(a.data).slice(0, 5)}</b> ${esc(a.titulo)}
            <div class="pauta-sub">${[horario(a), a.local, ORGS[a.org]?.nome].filter(Boolean).map(esc).join(' · ')}</div></div></div>`);

    $('pauta').innerHTML =
        secao('Ações a serem feitas', 'fa-list-check', itAcoes, 'Nenhuma ação pendente.') +
        secao('Chamados em oração', 'fa-hands-praying', itOracao, 'Nenhum chamado em oração.') +
        secao('Aguardando entrevista ou resposta', 'fa-user-clock', itConvite, 'Ninguém aguardando.') +
        secao('Apoios e desobrigações', 'fa-hand', itApoio, 'Nada para apoiar.') +
        secao('Designações pendentes', 'fa-hands', itDesig, 'Nenhuma designação pendente.') +
        entHTML +
        secao(`Atividades até ${formatDate(fim).slice(0, 5)}`, 'fa-calendar-days', itAtiv, 'Nenhuma atividade nas próximas 3 semanas.');
}

// Entrevistas na pauta
function renderEntrevistasPauta(t) {
    const agora = new Date();
    const agoraTxt = `${t}T${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    // "Desde a última reunião": data da reunião anterior a hoje (ou últimos 14 dias)
    const anterior = S.reunioes.map(r => r.data).filter(d => d && d < t).sort().pop() || somaDias(t, -14);
    const linhaEnt = e => `${esc(e.pessoa)} <span class="muted">· ${e.chamadoId ? esc(e.motivo || '') : esc(TIPOS_ENT[e.tipo] || '') + (e.motivo && e.motivo !== TIPOS_ENT[e.tipo] ? ' – ' + esc(e.motivo) : '')}</span>`;

    const aMarcar = S.entrevistas.filter(e => e.status === 'pendente')
        .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0))
        .map(e => `<div class="pauta-item">
            <div class="pauta-info"><b>${linhaEnt(e)}</b><div class="pauta-sub">${ENTREVISTADORES[e.entrevistador] || ''}</div></div>
            <div class="pauta-bts"><button class="btn btn-primary btn-sm" data-marcar="${esc(e.id)}">Marcar</button></div></div>`);

    const marcadas = S.entrevistas.filter(e => e.status === 'marcada').sort((a, b) => (a.quando || '').localeCompare(b.quando || ''));
    const vencidas = marcadas.filter(e => e.quando && e.quando < agoraTxt);
    const futuras = marcadas.filter(e => !e.quando || e.quando >= agoraTxt);
    const itVencidas = vencidas.map(e => `<div class="pauta-item vencida">
            <div class="pauta-info"><b>${linhaEnt(e)}</b>
                <div class="pauta-sub"><i class="fas fa-triangle-exclamation"></i> Era ${esc(quandoTxt(e.quando))} · ${ENTREVISTADORES[e.entrevistador] || ''} · <b>confirmar se foi feita</b></div></div>
            <div class="pauta-bts">
                <button class="btn btn-success btn-sm" data-realizada="${esc(e.id)}">Foi feita</button>
                <button class="btn btn-light btn-sm" data-marcar="${esc(e.id)}">Remarcar</button></div></div>`);
    const itFuturas = futuras.map(e => `<div class="pauta-item">
            <div class="pauta-info"><b>${linhaEnt(e)}</b><div class="pauta-sub"><i class="far fa-clock"></i> ${esc(quandoTxt(e.quando))} · ${ENTREVISTADORES[e.entrevistador] || ''}</div></div></div>`);

    const realizadas = S.entrevistas.filter(e => e.status === 'realizada' && (e.realizadaEm || '') >= anterior)
        .sort((a, b) => (b.realizadaEm || '').localeCompare(a.realizadaEm || ''))
        .map(e => `<div class="pauta-item feita">
            <div class="pauta-info"><i class="fas fa-check"></i> ${linhaEnt(e)}
                <div class="pauta-sub">Feita em ${formatDate(e.realizadaEm || '')}${e.resultado === 'aceitou' ? ' · aceitou' : e.resultado === 'recusou' ? ' · não aceitou' : ''}</div></div></div>`);

    const sub = (titulo, itens, vazio, cls = '') => `<div class="pauta-subtit ${cls}">${titulo} <span>${itens.length}</span></div>` +
        (itens.length ? itens.join('') : `<div class="pauta-vazio">${vazio}</div>`);
    const total = aMarcar.length + vencidas.length;
    return `<div class="pauta-sec">
        <div class="pauta-tit"><i class="fas fa-user-clock"></i> Entrevistas ${total ? `<span class="pauta-n${vencidas.length ? ' alerta' : ''}">${total}</span>` : ''}</div>
        ${vencidas.length ? sub('Data passou: confirmar se foi feita', itVencidas, '', 'alerta') : ''}
        ${sub('A marcar', aMarcar, 'Nenhuma entrevista a marcar.')}
        ${sub('Marcadas', itFuturas, 'Nenhuma entrevista marcada.')}
        ${sub(`Realizadas desde ${formatDate(anterior).slice(0, 5)}`, realizadas, 'Nenhuma realizada desde a última reunião.')}
    </div>`;
}

// =====================================================================
// Notas da reunião
// =====================================================================

function renderSeletor() {
    const opts = S.reunioes.map(r => `<option value="${esc(r.id)}">${formatDate(r.data)}</option>`).join('');
    $('rn-select').innerHTML = opts;
    $('rn-select').classList.toggle('hidden', !S.reunioes.length);
    if (!S.reunioes.some(r => r.id === atualId)) {
        atualId = S.reunioes[0]?.id || null;
        preencherForm();
    }
    if (atualId) $('rn-select').value = atualId;
    $('rn-vazio').classList.toggle('hidden', !!atualId);
    $('rn-form').classList.toggle('hidden', !atualId);
}

// Só preenche os campos de texto ao trocar de reunião (não atrapalha quem está digitando)
function preencherForm() {
    const r = S.reunioes.find(x => x.id === atualId);
    if (!r) return;
    $('rn-data').value = r.data || '';
    $('rn-presentes').value = r.presentes || '';
    $('rn-assuntos').value = r.assuntos || '';
    $('rn-acao-prazo').value = somaDias(r.data || hoje(), 7);
    $('rn-titulo').textContent = `Reunião do bispado · ${dataPorExtenso(r.data)}`;
}

function renderListas() {
    const r = S.reunioes.find(x => x.id === atualId);
    if (!r) return;
    const acoes = S.acoes.filter(a => a.reuniaoId === r.id);
    $('rn-acoes').innerHTML = acoes.length ? acoes.map(a => `<div class="rn-item${a.feita ? ' feita' : ''}${acaoAtrasada(a) ? ' atrasada' : ''}">
        <label class="rn-check"><input type="checkbox" data-acao="${esc(a.id)}" ${a.feita ? 'checked' : ''}>
        <span>${esc(a.descricao)}<small>${a.responsavel ? esc(a.responsavel) + ' · ' : ''}${a.prazo ? 'prazo ' + formatDate(a.prazo) : ''}${a.feita && a.feitaEm ? ' · feita em ' + formatDate(a.feitaEm) : ''}</small></span></label>
        <button class="btn-x" data-del-acao="${esc(a.id)}" title="Excluir"><i class="fas fa-xmark"></i></button></div>`).join('')
        : '<p class="muted">Nenhuma ação registrada nesta reunião.</p>';

    const chs = S.chamados.filter(c => c.reuniaoId === r.id);
    $('rn-chamados').innerHTML = chs.length ? chs.map(c => `<div class="rn-item" data-editar-ch="${esc(c.id)}">
        <span><b>${esc(c.pessoa)}</b> · ${esc(descChamado(c))}</span>
        <span class="etapa-badge etapa-${c.etapa}">${ETAPAS[c.etapa] || c.etapa}</span></div>`).join('')
        : '<p class="muted">Nenhum chamado discutido nesta reunião.</p>';

    $('lista-pessoas').innerHTML = nomesConhecidos().map(n => `<option value="${esc(n)}">`).join('');
    const resp = new Set(S.acoes.map(a => a.responsavel).filter(Boolean));
    $('lista-responsaveis').innerHTML = [...resp].sort().map(n => `<option value="${esc(n)}">`).join('');
}

function salvarCampos() {
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(() => {
        if (!atualId) return;
        salvarReuniao(atualId, {
            data: $('rn-data').value || hoje(),
            presentes: $('rn-presentes').value.trim(),
            assuntos: $('rn-assuntos').value
        });
        $('rn-salvo').textContent = 'Salvo';
        setTimeout(() => { $('rn-salvo').textContent = ''; }, 1500);
    }, 700);
}

function addAcao() {
    const r = S.reunioes.find(x => x.id === atualId);
    const descricao = $('rn-acao-desc').value.trim();
    if (!descricao) { showToast('Descreva a ação.', 'error'); $('rn-acao-desc').focus(); return; }
    criarAcao({ descricao, responsavel: $('rn-acao-resp').value.trim(), prazo: $('rn-acao-prazo').value, reuniaoId: r?.id, reuniaoData: r?.data });
    $('rn-acao-desc').value = '';
    $('rn-acao-resp').value = '';
    $('rn-acao-prazo').value = somaDias(r?.data || hoje(), 7);
    $('rn-acao-desc').focus();
}

function addChamado() {
    const r = S.reunioes.find(x => x.id === atualId);
    const pessoa = $('rn-ch-pessoa').value.trim().replace(/\s+/g, ' ');
    const tipo = $('rn-ch-tipo').value;
    const chamado = $('rn-ch-novo').value.trim();
    const chamadoAtual = $('rn-ch-atual').value.trim();
    if (!pessoa) { showToast('Informe a pessoa.', 'error'); $('rn-ch-pessoa').focus(); return; }
    if (tipo !== 'desobrigacao' && !chamado && $('rn-ch-decidido').checked) { showToast('Informe o chamado decidido.', 'error'); $('rn-ch-novo').focus(); return; }
    if (tipo !== 'chamado' && !chamadoAtual) { showToast('Informe o chamado atual.', 'error'); $('rn-ch-atual').focus(); return; }
    criarChamado({ pessoa, tipo, chamado, chamadoAtual, decidido: $('rn-ch-decidido').checked, reuniaoId: r?.id, reuniaoData: r?.data });
    if (!$('rn-ch-decidido').checked) showToast(`${pessoa}: em oração. Volta na pauta da próxima reunião.`);
    ['rn-ch-pessoa', 'rn-ch-novo', 'rn-ch-atual'].forEach(id => { $(id).value = ''; });
    $('rn-ch-decidido').checked = false;
}

function ajustarTipoChamado() {
    const t = $('rn-ch-tipo').value;
    $('rn-ch-novo-wrap').classList.toggle('hidden', t === 'desobrigacao');
    $('rn-ch-atual-wrap').classList.toggle('hidden', t === 'chamado');
    $('rn-ch-decidido-txt').textContent = t === 'desobrigacao' ? 'Já decidido (vai direto para a fila de entrevistas)' : 'Já sentimos o chamado (vai direto para a fila de entrevistas)';
}

// =====================================================================

function aceitou(c, sim) {
    const e = entrevistaDoChamado(c);
    if (e && e.status !== 'realizada') concluirEntrevista(e, sim ? 'aceitou' : 'recusou');
    else mudarEtapa(c, sim ? 'aceito' : 'recusado');
}

function cliquesComuns(e) {
    const g = (sel) => e.target.closest(sel);
    let el;
    const ch = id => S.chamados.find(c => c.id === id);
    if ((el = g('[data-acao]')) && el.tagName === 'INPUT') {
        const a = S.acoes.find(x => x.id === el.dataset.acao);
        if (a) marcarAcao(a, el.checked);
        return true;
    }
    if ((el = g('[data-del-acao]'))) {
        const a = S.acoes.find(x => x.id === el.dataset.delAcao);
        if (a && confirm(`Excluir a ação "${a.descricao}"?`)) excluirAcao(a);
        return true;
    }
    if ((el = g('[data-decidir]'))) { const c = ch(el.dataset.decidir); if (c) { if (!ehDesob(c) && !c.chamado) abrirChamado(c.id); else enviarParaEntrevista(c); } return true; }
    if ((el = g('[data-aceitou]'))) { const c = ch(el.dataset.aceitou); if (c) aceitou(c, true); return true; }
    if ((el = g('[data-recusou]'))) { const c = ch(el.dataset.recusou); if (c && confirm(`${c.pessoa} não aceitou?`)) aceitou(c, false); return true; }
    if ((el = g('[data-designado]'))) { const c = ch(el.dataset.designado); if (c) mudarEtapa(c, 'designado'); return true; }
    if ((el = g('[data-editar-ch]'))) { abrirChamado(el.dataset.editarCh); return true; }
    if ((el = g('[data-marcar]'))) { abrirEntrevista(el.dataset.marcar); return true; }
    if ((el = g('[data-realizada]'))) { marcarRealizada(el.dataset.realizada); return true; }
    return false;
}

export function initReunioes() {
    $('rn-ch-tipo').innerHTML = Object.entries(TIPOS_CHAMADO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    ajustarTipoChamado();
    $('rn-ch-tipo').addEventListener('change', ajustarTipoChamado);

    $('pauta').addEventListener('click', cliquesComuns);
    $('rn-form').addEventListener('click', cliquesComuns);

    const criar = () => {
        const ja = S.reunioes.find(r => r.data === hoje());
        if (ja && !confirm('Já existe uma reunião com a data de hoje. Criar outra mesmo assim?')) { atualId = ja.id; renderSeletor(); preencherForm(); renderListas(); return; }
        atualId = novaReuniao(hoje());
        setTimeout(() => { renderSeletor(); preencherForm(); renderListas(); $('rn-presentes').focus(); }, 50);
    };
    $('rn-nova').addEventListener('click', criar);
    $('rn-nova-2').addEventListener('click', criar);
    $('rn-select').addEventListener('change', () => { atualId = $('rn-select').value; preencherForm(); renderListas(); });
    ['rn-data', 'rn-presentes', 'rn-assuntos'].forEach(id => $(id).addEventListener('input', salvarCampos));
    $('rn-data').addEventListener('change', () => { $('rn-titulo').textContent = `Reunião do bispado · ${dataPorExtenso($('rn-data').value)}`; });
    $('rn-acao-add').addEventListener('click', addAcao);
    $('rn-acao-desc').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addAcao(); } });
    $('rn-ch-add').addEventListener('click', addChamado);
    $('rn-excluir').addEventListener('click', () => {
        const r = S.reunioes.find(x => x.id === atualId);
        if (r && confirm(`Excluir as notas da reunião de ${formatDate(r.data)}?\n\nAs ações e os chamados registrados nela continuam.`)) { excluirReuniao(r); atualId = null; }
    });
    $('rn-assuntos').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 2 + 'px'; });

    aoMudar(() => { renderPauta(); renderSeletor(); renderListas(); });
    renderPauta();
}

// A pauta também mostra atividades: atualiza quando a agenda muda
document.addEventListener('auto-ata-mudou', () => { if ($('pauta')) renderPauta(); });
