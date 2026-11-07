// Usuários: o bispado aprova cadastros e define os acessos
import { col, TS, SUPERADMIN } from './firebase.js';
import { S } from './state.js';
import { $, esc, norm, formatDate, toISO, showToast, abrirModal, fecharModal } from './util.js';
import { ORGS, orgBadge } from './agenda-core.js';

const PAPEIS = { bispado: 'Bispado', secretaria: 'Secretaria', executivo: 'Secretário executivo', musica: 'Música', editor: 'Editor' };
let editUid = null;

const ehSuperDoc = u => (u.email || '').toLowerCase() === SUPERADMIN;
const dataTs = ts => ts?.toDate ? formatDate(toISO(ts.toDate())) : '';

function avatar(u) {
    return u.foto
        ? `<span class="user-avatar"><img src="${esc(u.foto)}" alt="" referrerpolicy="no-referrer"></span>`
        : `<span class="user-avatar">${esc((u.nome || u.email || '?').trim()[0]?.toUpperCase() || '?')}</span>`;
}

function linha(u) {
    const papeis = ehSuperDoc(u)
        ? '<span class="papel-badge papel-super">Administrador principal</span>'
        : (u.papeis || []).map(p => `<span class="papel-badge papel-${p}">${PAPEIS[p] || p}</span>`).join('');
    const orgs = (u.papeis || []).includes('editor') ? (u.orgs || []).map(orgBadge).join('') : '';
    const acesso = dataTs(u.ultimoAcesso);
    const acoes = u.status === 'pendente'
        ? `<div class="us-acoes"><button class="btn btn-success btn-sm" data-aprovar="${esc(u.uid)}"><i class="fas fa-check"></i> Aprovar</button>
           <button class="btn btn-light btn-sm" data-recusar="${esc(u.uid)}">Recusar</button></div>`
        : '';
    return `<div class="us-item" data-uid="${esc(u.uid)}">
        ${avatar(u)}
        <div class="us-info">
            <div class="us-nome">${esc(u.nome || '(sem nome)')} ${papeis}</div>
            <div class="us-email">${esc(u.email || '')}${u.provedor === 'google.com' ? ' · Google' : ''}</div>
            ${orgs ? `<div class="us-orgs">${orgs}</div>` : ''}
            <div class="us-meta">Cadastro: ${dataTs(u.criadoEm) || '—'}${acesso ? ` · Último acesso: ${acesso}` : ''}</div>
        </div>
        ${acoes}
    </div>`;
}

function render() {
    const q = norm($('us-busca').value.trim());
    const lista = S.usuarios
        .filter(u => !q || norm(`${u.nome} ${u.email}`).includes(q))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    const grupos = [
        ['pendente', 'Aguardando aprovação'],
        ['aprovado', 'Com acesso'],
        ['bloqueado', 'Bloqueados']
    ];
    const pendentes = S.usuarios.filter(u => u.status === 'pendente').length;
    $('badge-pendentes').textContent = pendentes;
    $('badge-pendentes').classList.toggle('hidden', !pendentes);
    $('us-count').textContent = `(${S.usuarios.length})`;

    const html = grupos.map(([st, titulo]) => {
        const us = lista.filter(u => (u.status || 'pendente') === st);
        if (!us.length) return '';
        return `<div class="or-grupo">${titulo} (${us.length})</div>${us.map(linha).join('')}`;
    }).join('');
    $('us-lista').innerHTML = html || '<p class="empty-msg">Nenhum usuário encontrado.</p>';
}

function abrirUsuario(uid) {
    const u = S.usuarios.find(x => x.uid === uid);
    if (!u) return;
    if (ehSuperDoc(u)) { showToast('O administrador principal sempre tem acesso total.', 'info'); return; }
    editUid = uid;
    $('mu-titulo').textContent = u.nome || u.email;
    $('mu-email').textContent = `${u.email || ''} · ${u.status === 'pendente' ? 'aguardando aprovação' : u.status === 'bloqueado' ? 'bloqueado' : 'com acesso'}`;
    document.querySelectorAll('.mu-papel').forEach(c => { c.checked = (u.papeis || []).includes(c.value); });
    $('mu-orgs').innerHTML = Object.entries(ORGS).map(([k, o]) =>
        `<label class="check-row"><input type="checkbox" class="mu-org" value="${k}" ${(u.orgs || []).includes(k) ? 'checked' : ''}> <i class="org-dot" style="background:${o.cor}"></i> ${esc(o.nome)}</label>`).join('');
    atualizarOrgsVisiveis();
    $('mu-salvar-txt').textContent = u.status === 'aprovado' ? 'Salvar' : 'Aprovar com esses acessos';
    $('mu-bloquear').classList.toggle('hidden', u.status === 'bloqueado');
    $('mu-bloquear-txt').textContent = u.status === 'pendente' ? 'Recusar' : 'Bloquear';
    $('mu-aviso').innerHTML = u.uid === S.user.uid
        ? '<div class="aviso warn">Esta é a sua conta. Se tirar o acesso de bispado, você não poderá mais aprovar usuários.</div>' : '';
    abrirModal('modal-usuario');
}

function atualizarOrgsVisiveis() {
    const editor = document.querySelector('.mu-papel[value="editor"]').checked;
    $('mu-orgs-wrap').classList.toggle('hidden', !editor);
}

async function salvarUsuario() {
    const u = S.usuarios.find(x => x.uid === editUid);
    if (!u) return;
    const papeis = [...document.querySelectorAll('.mu-papel:checked')].map(c => c.value);
    const orgs = papeis.includes('editor') ? [...document.querySelectorAll('.mu-org:checked')].map(c => c.value) : [];
    if (!papeis.length && !confirm('Nenhum acesso marcado. A pessoa vai entrar, mas não verá nenhuma área. Continuar?')) return;
    if (papeis.includes('editor') && !orgs.length) { showToast('Escolha pelo menos uma organização para o editor.', 'error'); return; }
    if (u.uid === S.user.uid && !papeis.includes('bispado') && !confirm('Você está tirando seu próprio acesso de bispado. Continuar?')) return;
    try {
        await col.usuarios.doc(u.uid).set({
            status: 'aprovado', papeis, orgs,
            ...(u.status !== 'aprovado' ? { aprovadoPor: S.perfil?.nome || S.user.email, aprovadoEm: TS() } : {})
        }, { merge: true });
        showToast(u.status === 'aprovado' ? 'Acessos atualizados.' : `${u.nome || 'Usuário'} aprovado.`);
        fecharModal('modal-usuario');
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar. Verifique sua conexão.', 'error');
    }
}

async function bloquear(uid) {
    const u = S.usuarios.find(x => x.uid === uid);
    if (!u || ehSuperDoc(u)) return;
    const recusar = u.status === 'pendente';
    if (!confirm(recusar ? `Recusar o cadastro de ${u.nome || u.email}?` : `Bloquear o acesso de ${u.nome || u.email}?`)) return;
    try {
        await col.usuarios.doc(uid).set({ status: 'bloqueado', papeis: [], orgs: [] }, { merge: true });
        showToast(recusar ? 'Cadastro recusado.' : 'Acesso bloqueado.');
        fecharModal('modal-usuario');
    } catch (err) {
        console.error(err);
        showToast('Erro ao salvar.', 'error');
    }
}

export function initUsuarios() {
    $('us-busca').addEventListener('input', render);
    $('us-lista').addEventListener('click', e => {
        const ap = e.target.closest('[data-aprovar]');
        const rc = e.target.closest('[data-recusar]');
        if (ap) return abrirUsuario(ap.dataset.aprovar);
        if (rc) return bloquear(rc.dataset.recusar);
        const item = e.target.closest('.us-item');
        if (item) abrirUsuario(item.dataset.uid);
    });
    document.querySelectorAll('.mu-papel').forEach(c => c.addEventListener('change', atualizarOrgsVisiveis));
    $('mu-salvar').addEventListener('click', salvarUsuario);
    $('mu-bloquear').addEventListener('click', () => bloquear(editUid));
    $('modal-usuario').addEventListener('modal-fechado', () => { editUid = null; });

    col.usuarios.onSnapshot(snap => {
        S.usuarios = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        render();
        // Avisa quando chega um cadastro novo
        const pend = S.usuarios.filter(u => u.status === 'pendente').length;
        if (snap.docChanges().some(c => c.type === 'added' && c.doc.data().status === 'pendente') && !snap.metadata.fromCache && render.inicializado) {
            showToast(`Novo cadastro aguardando aprovação (${pend}).`, 'info', 5000);
        }
        render.inicializado = true;
    }, err => {
        console.error(err);
        $('us-lista').innerHTML = '<p class="empty-msg">Não foi possível carregar os usuários.</p>';
    });
}
