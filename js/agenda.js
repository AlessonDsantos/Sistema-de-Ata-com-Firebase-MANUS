// Agenda interna: editores de cada organização criam e alteram atividades
import { db, col, TS } from './firebase.js';
import { S, orgsEditaveis, podeEditarOrg, ehSecretaria } from './state.js';
import {
    $, esc, MESES, toISO, parseISO, hoje, formatDate, dataPorExtenso,
    showToast, abrirModal, fecharModal, statusDoSnapshot, updateStatus
} from './util.js';
import { ORGS, gradeHTML, legendaHTML, listaHTML, detalheHTML, orgBadge } from './agenda-core.js';

const agora = new Date();
let agY = agora.getFullYear(), agM = agora.getMonth();
let agModo = window.innerWidth <= 700 ? 'lista' : 'grade';
let diaAg = null;          // dia aberto no modal
let formModo = null;       // 'novo' | 'editar'

const editaveis = () => orgsEditaveis(ORGS);
const quem = () => ({ uid: S.user.uid, nome: S.perfil?.nome || S.user.email });

// --- Calendário ---

function renderAgenda() {
    $('ag-titulo').textContent = `${MESES[agM]} ${agY}`;
    $('ag-modo').innerHTML = agModo === 'grade'
        ? '<i class="fas fa-list"></i> <span class="lbl">Lista do mês</span>'
        : '<i class="fas fa-calendar"></i> <span class="lbl">Calendário</span>';

    if (agModo === 'grade') {
        $('ag-body').className = 'cal-grid';
        $('ag-body').innerHTML = gradeHTML(agY, agM, S.agenda, () => true);
    } else {
        const prefixo = `${agY}-${String(agM + 1).padStart(2, '0')}`;
        const doMes = Object.values(S.agenda).filter(a => a.data.startsWith(prefixo)).sort((a, b) => a.data.localeCompare(b.data));
        $('ag-body').className = 'ag-lista';
        $('ag-body').innerHTML = listaHTML(doMes, 'Nenhuma atividade neste mês.') +
            `<button class="btn btn-light btn-sm" id="ag-nova-data" style="margin-top:0.8rem;"><i class="fas fa-plus"></i> Nova atividade</button>`;
    }

    const proximas = Object.values(S.agenda).filter(a => a.data >= hoje()).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 8);
    $('ag-proximas').innerHTML = listaHTML(proximas, 'Nenhuma atividade futura.');

    const minhas = editaveis();
    $('ag-minhas').innerHTML = ehSecretaria()
        ? '<div class="aviso">Você pode criar e editar atividades de <b>todas as organizações</b>.</div>'
        : minhas.length
            ? `<div class="aviso">Você edita: ${minhas.map(orgBadge).join(' ')}</div>`
            : '<div class="aviso warn">Você ainda não tem organização para editar. Peça ao bispado.</div>';
}

function mudarMes(delta) {
    const d = new Date(agY, agM + delta, 1);
    agY = d.getFullYear(); agM = d.getMonth();
    renderAgenda();
}

// --- Modal do dia ---

function abrirDiaAg(iso) {
    diaAg = iso;
    renderDiaAg();
    abrirModal('modal-ag-dia');
}

function renderDiaAg() {
    const a = S.agenda[diaAg];
    $('agd-titulo').textContent = dataPorExtenso(diaAg);
    $('agd-form-wrap').classList.add('hidden');
    formModo = null;

    if (a) {
        const pode = podeEditarOrg(a.org, ORGS);
        $('agd-detalhe').innerHTML = detalheHTML(a) + (pode
            ? `<div class="modal-footer">
                    <button class="btn btn-danger btn-sm" id="agd-excluir"><i class="fas fa-trash"></i> Excluir</button>
                    <div style="flex-grow:1"></div>
                    <button class="btn btn-secondary btn-sm" id="agd-duplicar"><i class="fas fa-copy"></i> Duplicar para outra data</button>
                    <button class="btn btn-primary btn-sm" id="agd-editar"><i class="fas fa-pen"></i> Editar</button>
               </div>`
            : `<div class="aviso" style="margin-top:1rem;">Este dia já está ocupado. Só os editores de <b>${esc(ORGS[a.org]?.nome || a.org)}</b> podem alterar.</div>`);
        const editadoPor = a.atualizadoPor?.nome || a.criadoPor?.nome;
        if (editadoPor) $('agd-detalhe').insertAdjacentHTML('beforeend', `<p class="muted" style="margin-top:0.8rem;">Última alteração por ${esc(editadoPor)}.</p>`);
    } else if (editaveis().length) {
        $('agd-detalhe').innerHTML = `<div class="aviso" style="margin-bottom:1rem;">Dia livre.${diaAg < hoje() ? ' <b>Atenção: esta data já passou.</b>' : ''}</div>`;
        abrirForm(null);
    } else {
        $('agd-detalhe').innerHTML = '<div class="aviso">Dia livre, mas você não tem organização para criar atividades.</div>';
    }
}

function abrirForm(a) {
    formModo = a ? 'editar' : 'novo';
    const orgs = editaveis();
    $('agd-org').innerHTML = orgs.map(k => `<option value="${k}">${esc(ORGS[k].nome)}</option>`).join('');
    $('agd-org').value = a?.org || orgs[0];
    $('agd-org').disabled = orgs.length === 1;
    $('agd-nome').value = a?.titulo || '';
    $('agd-inicio').value = a?.inicio || '';
    $('agd-fim').value = a?.fim || '';
    $('agd-local').value = a?.local || '';
    $('agd-desc').value = a?.descricao || '';
    $('agd-form-wrap').classList.remove('hidden');
    if (a) $('agd-detalhe').innerHTML = '';
    $('agd-nome').focus();
}

function dadosDoForm() {
    const titulo = $('agd-nome').value.trim().replace(/\s+/g, ' ');
    const inicio = $('agd-inicio').value;
    const fim = $('agd-fim').value;
    const org = $('agd-org').value;
    if (!podeEditarOrg(org, ORGS)) { showToast('Você não pode criar atividades para essa organização.', 'error'); return null; }
    if (!titulo) { showToast('Informe o nome da atividade.', 'error'); $('agd-nome').focus(); return null; }
    if (!inicio) { showToast('Informe o horário de início.', 'error'); $('agd-inicio').focus(); return null; }
    if (fim && fim <= inicio) { showToast('O término precisa ser depois do início.', 'error'); $('agd-fim').focus(); return null; }
    return {
        data: diaAg, org, titulo, inicio, fim,
        local: $('agd-local').value.trim(),
        descricao: $('agd-desc').value.trim()
    };
}

function erroGravacao(err) {
    console.error(err);
    if (err?.code === 'ocupado') showToast(`Esse dia já tem uma atividade (${ORGS[err.org]?.nome || 'outra organização'}).`, 'error', 5000);
    else if (err?.code === 'sem-permissao' || err?.code === 'permission-denied') showToast('Você não tem permissão para alterar essa atividade.', 'error', 5000);
    else if (err?.code === 'unavailable' || !navigator.onLine) showToast('Sem internet: a agenda precisa de conexão para salvar.', 'error', 5000);
    else showToast('Erro ao salvar a atividade.', 'error', 5000);
}

// A transação garante que dois editores não marquem o mesmo dia ao mesmo tempo
async function gravar(data, dados, { novo }) {
    const ref = col.agenda.doc(data);
    await db.runTransaction(async t => {
        const snap = await t.get(ref);
        if (snap.exists) {
            const atual = snap.data();
            if (novo) throw { code: 'ocupado', org: atual.org };
            if (!podeEditarOrg(atual.org, ORGS)) throw { code: 'sem-permissao' };
            t.set(ref, { ...dados, updatedAt: TS(), atualizadoPor: quem() }, { merge: true });
        } else {
            t.set(ref, { ...dados, createdAt: TS(), criadoPor: quem(), updatedAt: TS(), atualizadoPor: quem() });
        }
    });
}

async function salvarAg() {
    const dados = dadosDoForm();
    if (!dados) return;
    const btn = $('agd-salvar');
    btn.disabled = true;
    try {
        await gravar(diaAg, dados, { novo: formModo === 'novo' });
        showToast(formModo === 'novo' ? 'Atividade criada.' : 'Atividade atualizada.');
        fecharModal('modal-ag-dia');
    } catch (err) {
        erroGravacao(err);
    } finally {
        btn.disabled = false;
    }
}

async function excluirAg() {
    const a = S.agenda[diaAg];
    if (!a || !confirm(`Excluir "${a.titulo}" de ${formatDate(a.data)}?`)) return;
    try {
        await col.agenda.doc(diaAg).delete();
        showToast('Atividade excluída.');
        fecharModal('modal-ag-dia');
    } catch (err) { erroGravacao(err); }
}

// --- Duplicar ---

function abrirDuplicar() {
    const a = S.agenda[diaAg];
    if (!a) return;
    const d = parseISO(diaAg);
    d.setDate(d.getDate() + 7);
    $('dup-info').textContent = `“${a.titulo}” (${ORGS[a.org]?.nome || ''})`;
    $('dup-data').value = toISO(d);
    checarDuplicar();
    abrirModal('modal-ag-dup');
}

function checarDuplicar() {
    const nova = $('dup-data').value;
    const ocupada = nova && S.agenda[nova];
    $('dup-aviso').innerHTML = !nova ? ''
        : ocupada ? `<div class="aviso erro">${formatDate(nova)} já tem “${esc(ocupada.titulo)}” (${esc(ORGS[ocupada.org]?.nome || '')}).</div>`
        : `<div class="aviso">${esc(dataPorExtenso(nova))} está livre.</div>`;
    $('dup-salvar').disabled = !nova || !!ocupada;
}

async function salvarDuplicar() {
    const a = S.agenda[diaAg];
    const nova = $('dup-data').value;
    if (!a || !nova) return;
    const { data, org, titulo, inicio, fim, local, descricao } = a;
    try {
        await gravar(nova, { data: nova, org, titulo, inicio: inicio || '', fim: fim || '', local: local || '', descricao: descricao || '' }, { novo: true });
        showToast(`Duplicada para ${formatDate(nova)}.`);
        fecharModal('modal-ag-dup');
    } catch (err) { erroGravacao(err); }
}

// --- Inicialização ---

export function initAgenda() {
    $('ag-prev').addEventListener('click', () => mudarMes(-1));
    $('ag-next').addEventListener('click', () => mudarMes(1));
    $('ag-hoje').addEventListener('click', () => { agY = agora.getFullYear(); agM = agora.getMonth(); renderAgenda(); });
    const alternar = () => { agModo = agModo === 'grade' ? 'lista' : 'grade'; renderAgenda(); };
    $('ag-titulo').addEventListener('click', alternar);
    $('ag-modo').addEventListener('click', alternar);
    $('ag-body').addEventListener('click', e => {
        if (e.target.closest('#ag-nova-data')) {
            const prefixo = `${agY}-${String(agM + 1).padStart(2, '0')}`;
            const inicio = hoje().startsWith(prefixo) ? hoje() : `${prefixo}-01`;
            const d = parseISO(inicio);
            while (S.agenda[toISO(d)] && d.getMonth() === agM) d.setDate(d.getDate() + 1);
            abrirDiaAg(toISO(d));
            return;
        }
        const el = e.target.closest('[data-date]');
        if (el) abrirDiaAg(el.dataset.date);
    });
    $('ag-proximas').addEventListener('click', e => {
        const el = e.target.closest('[data-date]');
        if (el) abrirDiaAg(el.dataset.date);
    });
    $('ag-legenda').innerHTML = legendaHTML();

    $('agd-detalhe').addEventListener('click', e => {
        if (e.target.closest('#agd-editar')) abrirForm(S.agenda[diaAg]);
        else if (e.target.closest('#agd-excluir')) excluirAg();
        else if (e.target.closest('#agd-duplicar')) abrirDuplicar();
    });
    $('agd-salvar').addEventListener('click', salvarAg);
    $('agd-cancelar').addEventListener('click', () => {
        if (formModo === 'editar') renderDiaAg(); else fecharModal('modal-ag-dia');
    });
    $('modal-ag-dia').addEventListener('modal-fechado', () => { diaAg = null; formModo = null; });
    $('dup-data').addEventListener('input', checarDuplicar);
    $('dup-salvar').addEventListener('click', salvarDuplicar);

    // Link público
    const link = new URL('agenda.html', location.href).href;
    $('ag-link').value = link;
    $('ag-copiar').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link); showToast('Link copiado!'); }
        catch (e) { $('ag-link').select(); document.execCommand('copy'); showToast('Link copiado!'); }
    });

    renderAgenda();
    col.agenda.onSnapshot({ includeMetadataChanges: true }, snap => {
        S.agenda = {};
        snap.docs.forEach(d => { S.agenda[d.id] = { ...d.data(), data: d.id }; });
        renderAgenda();
        if (diaAg && !$('modal-ag-dia').classList.contains('hidden') && !formModo) renderDiaAg();
        if (!$('modal-ag-dup').classList.contains('hidden')) checarDuplicar();
        if (!ehSecretaria()) statusDoSnapshot(snap);
    }, err => {
        console.error(err);
        updateStatus('erro');
        showToast('Erro ao carregar a agenda.', 'error');
    });
}
