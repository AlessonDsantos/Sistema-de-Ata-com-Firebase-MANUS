// Hinos da reunião sacramental: a líder de música escolhe os hinos pelos temas dos discursos.
// A líder vê só os temas (coleção "temasSemana"), nunca os nomes dos oradores.
import { col, TS } from './firebase.js';
import { S, ehSecretaria } from './state.js';
import {
    $, esc, norm, MESES, parseISO, toISO, hoje, formatDate, dataPorExtenso, diasEntre,
    showToast, abrirModal, fecharModal, statusDoSnapshot
} from './util.js';
import { HINOS, ASSUNTOS, hinoPorNum, urlHino, sugerir } from './hinos-core.js';

export const MOMENTOS = {
    abertura: 'Hino de abertura',
    sacramental: 'Hino sacramental',
    intermediario: 'Hino intermediário',
    final: 'Hino final'
};
// Campos correspondentes na ata
const CAMPOS_ATA = {
    abertura: ['hino_abertura', 'hino_abertura_num'],
    sacramental: ['hino_sacramental', 'hino_sacramental_num'],
    intermediario: ['interludio', 'interludio_num'],
    final: ['hino_encerramento', 'hino_encerramento_num']
};
const TIPO_NOME = {
    normal: 'Reunião normal', jejum: 'Jejum e testemunho', conf_geral: 'Conferência Geral',
    conf_estaca: 'Conferência de Estaca', outro: 'Reunião especial'
};
const SEM_REUNIAO = ['conf_geral', 'conf_estaca'];

const carregado = { temas: false, hinos: false };
let diaHino = null, momentoHino = null, filtroAssunto = '';

const tipoDoDia = d => S.temasSemana[d]?.tipo || (parseISO(d).getDate() <= 7 ? 'jejum' : 'normal');
const momentosDoDia = d => {
    const tipo = tipoDoDia(d);
    if (SEM_REUNIAO.includes(tipo)) return [];
    return tipo === 'jejum' ? ['abertura', 'sacramental', 'final'] : ['abertura', 'sacramental', 'intermediario', 'final'];
};
const temasDoDia = d => (S.temasSemana[d]?.temas || []).map(t => t.tema).filter(Boolean);

// =====================================================================
// Integração com a ata (feita pelo aparelho da secretaria/bispado)
// =====================================================================

// Campos da ata para os hinos escolhidos naquele domingo
export function hinosParaAta(data, tipoAta) {
    const h = S.hinos[data];
    if (!h) return null;
    const r = {};
    Object.entries(CAMPOS_ATA).forEach(([m, [campo, campoNum]]) => {
        if (m === 'intermediario' && tipoAta === 'testemunho') return;
        if (!(m in h)) return;
        r[campo] = h[m]?.titulo || '';
        r[campoNum] = h[m]?.num ? String(h[m].num) : '';
    });
    return r;
}

// Cada escolha de hinos tem uma "versão". A ata guarda a versão que já recebeu;
// se a líder mudar algo depois, a ata é atualizada. Alterações feitas à mão na ata
// continuam valendo até a líder mudar os hinos de novo.
let timerAtas = null;
export function agendarSyncHinosAtas() {
    if (!ehSecretaria()) return;
    clearTimeout(timerAtas);
    timerAtas = setTimeout(syncHinosAtas, 800);
}
function syncHinosAtas() {
    if (!carregado.hinos || !S.atasCarregadas) return;
    S.atas.forEach(a => {
        const h = S.hinos[a.data];
        if (!h?.versao || (a.hinosVersao || 0) >= h.versao) return;
        const campos = hinosParaAta(a.data, a.tipo_ata);
        col.atas.doc(a.id).set({ ...campos, hinosVersao: h.versao, updatedAt: TS() }, { merge: true })
            .catch(err => console.error('Erro ao levar os hinos para a ata:', err));
    });
}

// Temas da semana (sem nomes) para a líder de música. Gerado a partir dos discursos.
let timerTemas = null;
export function agendarSyncTemas(discDoDia, domTipo) {
    if (!ehSecretaria()) return;
    clearTimeout(timerTemas);
    timerTemas = setTimeout(() => syncTemas(discDoDia, domTipo), 1500);
}
function syncTemas(discDoDia, domTipo) {
    if (!carregado.temas || !S.discursosCarregados) return;
    const t = hoje();
    const datas = [...S.discursos.map(d => d.data), ...Object.keys(S.domingos)].filter(d => d >= t);
    const minimo = new Date(); minimo.setDate(minimo.getDate() + 35);
    const fim = [toISO(minimo), ...datas].sort().pop();
    const d = parseISO(t);
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    for (; toISO(d) <= fim; d.setDate(d.getDate() + 7)) {
        const iso = toISO(d);
        const doc = {
            data: iso,
            tipo: domTipo(iso),
            temas: discDoDia(iso).filter(x => x.status !== 'recusou').map(x => ({ slot: x.slot || 1, tema: (x.tema || '').trim() }))
        };
        const atual = S.temasSemana[iso];
        if (atual && atual.tipo === doc.tipo && JSON.stringify(atual.temas || []) === JSON.stringify(doc.temas)) continue;
        col.temasSemana.doc(iso).set({ ...doc, updatedAt: TS() })
            .catch(err => console.error('Erro ao atualizar temas da semana:', err));
    }
}

// =====================================================================
// Tela da líder de música
// =====================================================================

function usoRecente(num, data) {
    return Object.entries(S.hinos)
        .filter(([d, h]) => d !== data && diasEntre(d, data) <= 56 && Object.keys(MOMENTOS).some(m => h[m]?.num === num))
        .map(([d]) => d).sort();
}

function renderHinos() {
    const t = hoje();
    const datas = [...new Set([...Object.keys(S.temasSemana), ...Object.keys(S.hinos)])]
        .filter(d => d >= t && parseISO(d).getDay() === 0).sort();
    if (!carregado.temas || !carregado.hinos) return;
    if (!datas.length) {
        $('hn-lista').innerHTML = '<p class="empty-msg">Nenhum domingo planejado ainda. Quando a secretaria planejar os discursantes, os temas aparecem aqui.</p>';
        return;
    }
    let mes = '', html = '';
    datas.forEach(d => {
        const dt = parseISO(d);
        const chave = `${MESES[dt.getMonth()]} ${dt.getFullYear()}`;
        if (chave !== mes) { mes = chave; html += `<div class="or-grupo">${chave}</div>`; }
        html += cardDia(d);
    });
    $('hn-lista').innerHTML = html;
}

function cardDia(d) {
    const tipo = tipoDoDia(d);
    const momentos = momentosDoDia(d);
    const h = S.hinos[d] || {};
    const temas = S.temasSemana[d]?.temas || [];
    const feitos = momentos.filter(m => h[m]?.num).length;
    const status = !momentos.length ? '' : feitos === momentos.length
        ? '<span class="st-badge st-discursou"><i class="fas fa-check"></i> Completo</span>'
        : `<span class="st-badge st-convidado">${feitos} de ${momentos.length}</span>`;

    const temasHTML = SEM_REUNIAO.includes(tipo)
        ? '<p class="muted">Não há reunião sacramental na ala neste domingo.</p>'
        : temas.length
            ? `<ul class="hn-temas">${temas.map(x => `<li>${x.tema ? esc(x.tema) : '<span class="muted">Tema ainda não definido</span>'}</li>`).join('')}</ul>`
            : `<p class="muted">${tipo === 'jejum' ? 'Reunião de jejum e testemunho (sem discursos).' : 'Temas ainda não definidos.'}</p>`;

    const slots = momentos.map(m => {
        const esc_ = h[m]?.num ? hinoPorNum(h[m].num) : null;
        const escolhido = h[m]?.num
            ? `<span class="hn-esc-num">${h[m].num}</span><span class="hn-esc-tit">${esc(h[m].titulo || esc_?.titulo || '')}</span>
               <a href="${esc(urlHino(h[m].num))}" target="_blank" rel="noopener" class="hn-link" title="Abrir o hino no site da Igreja"><i class="fas fa-up-right-from-square"></i></a>`
            : '<span class="hn-vazio"><i class="fas fa-plus"></i> Escolher</span>';
        return `<div class="hn-slot${h[m]?.num ? ' ok' : ''}" data-dia="${d}" data-momento="${m}">
            <div class="hn-slot-l">${MOMENTOS[m]}</div><div class="hn-slot-v">${escolhido}</div></div>`;
    }).join('');

    return `<div class="hn-card">
        <div class="semana-head">
            <strong>${esc(dataPorExtenso(d, false))}</strong>
            <span class="dom-tag tag-${tipo}">${TIPO_NOME[tipo] || tipo}</span>
            <div style="flex-grow:1"></div>${status}
        </div>
        ${temasHTML}
        ${slots ? `<div class="hn-slots">${slots}</div>` : ''}
    </div>`;
}

// --- Modal de escolha ---

function abrirEscolha(dia, momento) {
    diaHino = dia; momentoHino = momento; filtroAssunto = '';
    $('hn-busca').value = '';
    $('hn-modal-titulo').textContent = `${MOMENTOS[momento]} · ${formatDate(dia)}`;
    const temas = temasDoDia(dia);
    $('hn-modal-temas').innerHTML = momento === 'sacramental'
        ? '<div class="aviso">Hinos próprios para o sacramento.</div>'
        : temas.length
            ? `<div class="hn-modal-temas"><b>Temas:</b> ${temas.map(esc).join(' · ')}</div>`
            : '<div class="aviso warn">Ainda não há temas para este domingo. Use a busca ou os assuntos abaixo.</div>';
    $('hn-assuntos').innerHTML = Object.entries(ASSUNTOS)
        .map(([k, a]) => `<button class="hn-chip" data-assunto="${k}">${esc(a.nome)}</button>`).join('');
    $('hn-assuntos-wrap').classList.toggle('hidden', momento === 'sacramental');
    $('hn-assuntos-wrap').open = window.innerWidth > 768;   // no celular começa recolhido
    renderEscolha();
    abrirModal('modal-hino');
}

function linhaHino(h, motivo = []) {
    const atual = S.hinos[diaHino] || {};
    const escolhidoAqui = atual[momentoHino]?.num === h.num;
    const emOutro = Object.keys(MOMENTOS).find(m => m !== momentoHino && atual[m]?.num === h.num);
    const recentes = usoRecente(h.num, diaHino);
    const avisos = [
        emOutro ? `Já escolhido como ${MOMENTOS[emOutro].toLowerCase()} neste domingo` : '',
        recentes.length ? `Usado em ${recentes.map(formatDate).join(', ')}` : ''
    ].filter(Boolean);
    return `<div class="hn-item${escolhidoAqui ? ' atual' : ''}">
        <span class="hn-num">${h.num}</span>
        <div class="hn-info">
            <a href="${esc(h.url)}" target="_blank" rel="noopener" class="hn-titulo" title="Abrir o hino no site da Igreja">${esc(h.titulo)} <i class="fas fa-up-right-from-square"></i></a>
            ${motivo.length ? `<div class="hn-motivo">${motivo.map(esc).join(' · ')}</div>` : ''}
            ${avisos.length ? `<div class="hn-aviso"><i class="fas fa-triangle-exclamation"></i> ${avisos.map(esc).join(' · ')}</div>` : ''}
        </div>
        ${escolhidoAqui
            ? '<button class="btn btn-light btn-sm" data-remover>Remover</button>'
            : `<button class="btn btn-success btn-sm" data-escolher="${h.num}">Escolher</button>`}
    </div>`;
}

function renderEscolha() {
    const q = norm($('hn-busca').value.trim());
    document.querySelectorAll('#hn-assuntos .hn-chip').forEach(c => c.classList.toggle('active', c.dataset.assunto === filtroAssunto));
    $('hn-assunto-ativo').textContent = filtroAssunto ? `· ${ASSUNTOS[filtroAssunto].nome}` : '';
    let titulo, itens;
    if (q || filtroAssunto) {
        const lista = HINOS.filter(h =>
            (!q || h.busca.includes(q)) &&
            (!filtroAssunto || h.assuntos.includes(filtroAssunto)) &&
            (momentoHino === 'sacramental' ? h.cat === 'sacramental' : true));
        titulo = `${lista.length} hino${lista.length === 1 ? '' : 's'} encontrado${lista.length === 1 ? '' : 's'}`;
        itens = lista.map(h => linhaHino(h));
    } else {
        const sug = sugerir(temasDoDia(diaHino), momentoHino, diaHino);
        titulo = momentoHino === 'sacramental' ? 'Hinos sacramentais' : 'Sugestões pelos temas';
        itens = sug.map(s => linhaHino(s.hino, s.motivo));
        if (!itens.length) itens = ['<p class="muted">Nenhuma sugestão para estes temas. Busque pelo nome ou número, ou escolha um assunto acima.</p>'];
    }
    $('hn-res-titulo').textContent = titulo;
    $('hn-resultados').innerHTML = itens.join('') || '<p class="muted">Nenhum hino encontrado.</p>';
}

async function salvarEscolha(num) {
    const h = num ? hinoPorNum(num) : null;
    const dados = {
        data: diaHino,
        [momentoHino]: h ? { num: h.num, titulo: h.titulo } : null,
        versao: Date.now(),
        atualizadoPor: { uid: S.user.uid, nome: S.perfil?.nome || S.user.email },
        updatedAt: TS()
    };
    const dia = diaHino, momento = momentoHino;
    fecharModal('modal-hino');
    try {
        await col.hinos.doc(dia).set(dados, { merge: true });
        showToast(h ? `${MOMENTOS[momento]}: ${h.num} – ${h.titulo}` : 'Hino removido.');
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar o hino. Verifique sua conexão.', 'error', 5000);
    }
}

// =====================================================================

export function initHinos() {
    $('hn-lista').addEventListener('click', e => {
        if (e.target.closest('a')) return;
        const s = e.target.closest('.hn-slot');
        if (s) abrirEscolha(s.dataset.dia, s.dataset.momento);
    });
    $('hn-busca').addEventListener('input', renderEscolha);
    $('hn-assuntos').addEventListener('click', e => {
        const c = e.target.closest('[data-assunto]');
        if (!c) return;
        filtroAssunto = filtroAssunto === c.dataset.assunto ? '' : c.dataset.assunto;
        renderEscolha();
    });
    $('hn-resultados').addEventListener('click', e => {
        const b = e.target.closest('[data-escolher]');
        if (b) salvarEscolha(+b.dataset.escolher);
        else if (e.target.closest('[data-remover]')) salvarEscolha(null);
    });
    $('modal-hino').addEventListener('modal-fechado', () => { diaHino = null; momentoHino = null; });

    const onErr = err => { console.error(err); showToast('Erro ao carregar os hinos. Verifique seu acesso.', 'error', 6000); };
    col.temasSemana.onSnapshot(snap => {
        S.temasSemana = {};
        snap.docs.forEach(d => { S.temasSemana[d.id] = d.data(); });
        carregado.temas = true;
        renderHinos();
    }, onErr);
    col.hinos.onSnapshot({ includeMetadataChanges: true }, snap => {
        S.hinos = {};
        snap.docs.forEach(d => { S.hinos[d.id] = d.data(); });
        carregado.hinos = true;
        if (!ehSecretaria()) statusDoSnapshot(snap);
        renderHinos();
        if (diaHino && !$('modal-hino').classList.contains('hidden')) renderEscolha();
        agendarSyncHinosAtas();
        document.dispatchEvent(new CustomEvent('hinos-mudaram'));
    }, onErr);
}
