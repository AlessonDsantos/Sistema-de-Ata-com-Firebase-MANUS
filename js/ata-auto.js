// Preenchimento automático da ata com a agenda e os chamados.
// - Anúncios: atividades da agenda até 3 semanas depois do domingo.
// - Ordenanças / Desobrigações / Apoios: chamados aceitos com apoio marcado para aquele domingo.
// O texto automático fica no começo do campo. O que a secretaria escrever DEPOIS dele é mantido.
// Se ela editar o próprio texto automático, o sistema para de mexer naquele campo e mostra um aviso.
import { col, TS } from './firebase.js';
import { S, ehSecretaria } from './state.js';
import { parseISO, hoje, formatDate, DIAS } from './util.js';
import { ORGS, horario } from './agenda-core.js';

export const DIAS_ANUNCIO = 21;

const somaDias = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function gerarAnuncios(data) {
    if (!data) return '';
    const fim = somaDias(data, DIAS_ANUNCIO);
    const ats = Object.values(S.agenda).filter(a => a.data >= data && a.data <= fim).sort((a, b) => a.data.localeCompare(b.data));
    if (!ats.length) return '';
    return 'Atividades:\n' + ats.map(a => {
        const d = parseISO(a.data);
        const h = horario(a);
        return `• ${DIAS[d.getDay()]} ${formatDate(a.data).slice(0, 5)}${h ? ', ' + h : ''} – ${a.titulo}${a.local ? ` (${a.local})` : ''}${ORGS[a.org] && a.org !== 'ala' ? ` – ${ORGS[a.org].nome}` : ''}`;
    }).join('\n');
}

export function gerarAcoes(data) {
    if (!data) return '';
    const doDia = S.chamados.filter(c => c.domingoApoio === data && ['aceito', 'apoiado', 'designado'].includes(c.etapa))
        .sort((a, b) => (a.pessoa || '').localeCompare(b.pessoa || '', 'pt-BR'));
    const desob = doDia.filter(c => c.chamadoAtual && c.tipo !== 'chamado').map(c => `• ${c.pessoa} – ${c.chamadoAtual}`);
    const apoios = doDia.filter(c => c.tipo !== 'desobrigacao' && c.chamado).map(c => `• ${c.pessoa} – ${c.chamado}`);
    return [
        desob.length ? 'Desobrigações:\n' + desob.join('\n') : '',
        apoios.length ? 'Apoios:\n' + apoios.join('\n') : ''
    ].filter(Boolean).join('\n');
}

const GERADORES = { anuncios: gerarAnuncios, acoes: gerarAcoes };

// Junta o texto automático novo com o que foi escrito à mão depois do anterior
function mesclar(atual, ultimoAuto, novoAuto) {
    atual = atual || ''; ultimoAuto = ultimoAuto || '';
    if (!atual.startsWith(ultimoAuto)) return null;   // texto automático editado à mão
    const resto = atual.slice(ultimoAuto.length).replace(/^\s*\n/, '').replace(/^\n+/, '');
    return [novoAuto, resto].filter(Boolean).join('\n\n');
}

export const dadosProntos = () => S.agendaCarregada && S.chamadosCarregados;

// a = { data, anuncios, acoes, auto_anuncios, auto_acoes }
export function calcularAuto(a) {
    const upd = {}, conflitos = {};
    if (!dadosProntos() || !a.data) return { upd, conflitos };
    for (const [campo, gerar] of Object.entries(GERADORES)) {
        const novo = gerar(a.data);
        const ult = a['auto_' + campo] || '';
        if (novo === ult) continue;
        const v = mesclar(a[campo], ult, novo);
        if (v === null) { conflitos[campo] = novo; continue; }
        upd[campo] = v;
        upd['auto_' + campo] = novo;
    }
    return { upd, conflitos };
}

let timer = null;
export function agendarSyncAuto() {
    if (!ehSecretaria()) return;   // só quem pode mexer nas atas
    clearTimeout(timer);
    timer = setTimeout(syncAuto, 900);
}

function syncAuto() {
    if (!S.atasCarregadas || !dadosProntos()) return;
    const t = hoje();
    // Atas de hoje em diante acompanham a agenda e os chamados
    S.atas.filter(a => a.data && a.data >= t).forEach(a => {
        const { upd } = calcularAuto(a);
        if (Object.keys(upd).length) {
            col.atas.doc(a.id).set({ ...upd, updatedAt: TS() }, { merge: true })
                .catch(err => console.error('Erro ao atualizar a ata automaticamente:', err));
        }
    });
    // Chamado aceito com ata do domingo do apoio já registrada (e o domingo chegou): apoiado
    S.chamados.filter(c => c.etapa === 'aceito' && c.domingoApoio && c.domingoApoio <= t && S.atas.some(a => a.data === c.domingoApoio))
        .forEach(c => {
            const fim = c.tipo === 'desobrigacao' ? 'designado' : 'apoiado';
            col.chamados.doc(c.id).set({
                etapa: fim, apoiadoEm: c.domingoApoio, updatedAt: TS(),
                historico: firebase.firestore.FieldValue.arrayUnion({ etapa: fim, data: c.domingoApoio, por: 'Ata da reunião sacramental' })
            }, { merge: true }).catch(err => console.error(err));
        });
    document.dispatchEvent(new CustomEvent('auto-ata-mudou'));
}
