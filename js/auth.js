// Login (e-mail/senha ou Google), cadastro e aprovação
import { db, col, TS } from './firebase.js';
import { S, ehSuper, aprovado, ehBispado, ehSecretaria, temPapel } from './state.js';
import { $, esc, showToast } from './util.js';

const auth = firebase.auth();
auth.languageCode = 'pt-BR';

let modo = 'entrar';            // 'entrar' | 'cadastrar'
let nomeCadastro = '';
let unsubPerfil = null;
let assinatura = null;          // acessos com que o app foi aberto; se mudar, recarrega
let aoEntrar = null;

const ERROS = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-disabled': 'Esta conta foi desativada.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use "Entrar" ou "Esqueci a senha".',
    'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente de novo.',
    'auth/unauthorized-domain': 'Este endereço não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).',
    'auth/operation-not-allowed': 'Este método de login não está ativado no Firebase.',
    'auth/account-exists-with-different-credential': 'Este e-mail já tem conta com outro método. Entre com e-mail e senha.',
    'auth/missing-password': 'Informe a senha.'
};
const SILENCIOSOS = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

function mostrarErro(msg) {
    $('login-erro').innerHTML = msg;
    $('login-erro').classList.toggle('hidden', !msg);
}
function erroAuth(err) {
    console.error(err);
    if (SILENCIOSOS.includes(err.code)) return;
    mostrarErro(esc(ERROS[err.code] || 'Não foi possível entrar. Tente novamente.'));
}

function mostrarTelaPrincipal(id) {
    ['tela-carregando', 'tela-login', 'tela-pendente', 'app'].forEach(t => $(t).classList.toggle('hidden', t !== id));
}

function trocarModo(m) {
    modo = m;
    const cad = m === 'cadastrar';
    document.querySelectorAll('[data-login-aba]').forEach(b => b.classList.toggle('active', b.dataset.loginAba === m));
    $('grupo-nome').classList.toggle('hidden', !cad);
    $('grupo-senha2').classList.toggle('hidden', !cad);
    $('btn-esqueci').classList.toggle('hidden', cad);
    $('btn-login-submit').textContent = cad ? 'Criar conta' : 'Entrar';
    $('btn-google-txt').textContent = cad ? 'Criar conta com Google' : 'Entrar com Google';
    $('login-senha').autocomplete = cad ? 'new-password' : 'current-password';
    mostrarErro('');
}

async function enviarForm(e) {
    e.preventDefault();
    mostrarErro('');
    const email = $('login-email').value.trim();
    const senha = $('login-senha').value;
    const btn = $('btn-login-submit');
    if (modo === 'cadastrar') {
        const nome = $('login-nome').value.trim().replace(/\s+/g, ' ');
        if (nome.length < 3) { mostrarErro('Informe seu nome completo.'); $('login-nome').focus(); return; }
        if (senha.length < 6) { mostrarErro('A senha precisa ter pelo menos 6 caracteres.'); return; }
        if (senha !== $('login-senha2').value) { mostrarErro('As senhas não conferem.'); $('login-senha2').focus(); return; }
        nomeCadastro = nome;
    }
    btn.disabled = true;
    try {
        if (modo === 'cadastrar') {
            const cred = await auth.createUserWithEmailAndPassword(email, senha);
            await cred.user.updateProfile({ displayName: nomeCadastro }).catch(() => {});
        } else {
            await auth.signInWithEmailAndPassword(email, senha);
        }
    } catch (err) {
        erroAuth(err);
    } finally {
        btn.disabled = false;
    }
}

async function entrarGoogle() {
    mostrarErro('');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        await auth.signInWithPopup(provider);
    } catch (err) {
        erroAuth(err);
    }
}

async function esqueciSenha() {
    const email = $('login-email').value.trim();
    if (!email) { mostrarErro('Digite seu e-mail acima e toque em "Esqueci a senha" de novo.'); $('login-email').focus(); return; }
    try {
        await auth.sendPasswordResetEmail(email);
        mostrarErro('');
        showToast('Se existir uma conta com esse e-mail, enviamos um link para criar nova senha. Veja também o spam.', 'info', 7000);
    } catch (err) {
        erroAuth(err);
    }
}

export async function sair() {
    if (S.isDirty && !confirm('Há alterações não salvas na ata. Sair mesmo assim?')) return;
    S.isDirty = false;
    if (unsubPerfil) unsubPerfil();
    try { await auth.signOut(); } catch (e) {}
    // Apaga os dados guardados neste aparelho (importante em celular/computador compartilhado)
    try { await db.terminate(); await db.clearPersistence(); } catch (e) {}
    try { localStorage.removeItem('telaAtual'); } catch (e) {}
    location.reload();
}

// --- Perfil (usuarios/{uid}) ---

async function criarPerfil(ref, user) {
    const sup = ehSuper();
    const nome = nomeCadastro || user.displayName || (user.email || '').split('@')[0];
    try {
        await ref.set({
            nome,
            email: user.email || '',
            foto: user.photoURL || '',
            provedor: user.providerData?.[0]?.providerId || 'password',
            status: sup ? 'aprovado' : 'pendente',
            papeis: sup ? ['bispado'] : [],
            orgs: [],
            criadoEm: TS(),
            ultimoAcesso: TS()
        });
    } catch (err) {
        console.error(err);
        mostrarTelaPrincipal('tela-login');
        mostrarErro('Não foi possível criar seu cadastro. Verifique a internet e tente de novo.');
    }
}

function assinaturaAtual() {
    return JSON.stringify([aprovado(), ehBispado(), ehSecretaria(), temPapel('editor'), temPapel('musica'), temPapel('executivo'), [...(S.perfil?.orgs || [])].sort()]);
}

function telaPendente(p) {
    const bloqueado = p.status === 'bloqueado';
    $('pendente-titulo').textContent = bloqueado ? 'Acesso bloqueado' : 'Aguardando aprovação';
    $('pendente-msg').innerHTML = bloqueado
        ? 'Seu acesso foi bloqueado. Se acha que é um engano, fale com o bispado.'
        : `Olá, <b>${esc(p.nome || '')}</b>! Seu cadastro foi recebido. Um membro do bispado precisa aprovar seu acesso. Esta tela atualiza sozinha quando for aprovado.`;
    $('pendente-email').textContent = p.email || '';
    mostrarTelaPrincipal('tela-pendente');
}

function preencherUsuario(p) {
    const nome = p.nome || S.user.email;
    $('user-nome').textContent = nome.split(' ')[0];
    $('user-chip').title = `${nome} (${S.user.email})`;
    $('user-avatar').innerHTML = p.foto
        ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer">`
        : esc(nome.trim()[0]?.toUpperCase() || '?');
}

function tratarUsuario(user) {
    if (unsubPerfil) { unsubPerfil(); unsubPerfil = null; }
    S.user = user;
    S.perfil = null;
    if (!user) { mostrarTelaPrincipal('tela-login'); return; }

    mostrarTelaPrincipal('tela-carregando');
    const ref = col.usuarios.doc(user.uid);
    unsubPerfil = ref.onSnapshot(snap => {
        if (!snap.exists) {
            if (!snap.metadata.fromCache || !navigator.onLine) criarPerfil(ref, user);
            return;
        }
        const p = snap.data();
        S.perfil = p;

        // O administrador principal sempre fica como bispado aprovado
        if (ehSuper() && (p.status !== 'aprovado' || !(p.papeis || []).includes('bispado'))) {
            ref.set({ status: 'aprovado', papeis: [...new Set([...(p.papeis || []), 'bispado'])] }, { merge: true }).catch(console.error);
        }

        const sig = assinaturaAtual();
        if (assinatura !== null) {
            // Acessos mudaram (aprovado, bloqueado, novo papel): recarrega para aplicar
            if (sig !== assinatura) location.reload();
            return;
        }
        assinatura = sig;

        if (!aprovado()) { telaPendente(p); return; }

        preencherUsuario(p);
        mostrarTelaPrincipal('app');
        ref.update({ ultimoAcesso: TS() }).catch(() => {});
        aoEntrar?.();
    }, err => {
        console.error(err);
        mostrarTelaPrincipal('tela-login');
        mostrarErro('Não foi possível carregar seu cadastro. Tente novamente.');
    });
}

export function initAuth(callback) {
    aoEntrar = callback;
    document.querySelectorAll('[data-login-aba]').forEach(b => b.addEventListener('click', () => trocarModo(b.dataset.loginAba)));
    $('form-login').addEventListener('submit', enviarForm);
    $('btn-google').addEventListener('click', entrarGoogle);
    $('btn-esqueci').addEventListener('click', esqueciSenha);
    $('btn-sair').addEventListener('click', sair);
    $('btn-sair-pendente').addEventListener('click', sair);
    trocarModo('entrar');
    auth.onAuthStateChanged(tratarUsuario);
}
