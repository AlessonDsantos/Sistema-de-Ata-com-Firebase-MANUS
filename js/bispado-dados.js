// Bispado: reuniões, ações, chamados e entrevistas (dados e operações compartilhadas)
import { db, col, TS } from './firebase.js';
import { S, podeAgenda, ehSecretaria } from './state.js';
import { hoje, parseISO, toISO, formatDate, showToast, statusDoSnapshot } from './util.js';
import { agendarSyncAuto } from './ata-auto.js';

// Etapas do chamado
export const ETAPAS = {
    oracao:    'Em oração',
    convite:   'Aguardando entrevista',
    aceito:    'Aceito · aguardando apoio',
    apoiado:   'Apoiado · aguardando designação',
    designado: 'Concluído',
    recusado:  'Não aceitou'
};
export const ORDEM_ETAPAS = ['oracao', 'convite', 'aceito', 'apoiado', 'designado'];
export const TIPOS_CHAMADO = { chamado: 'Novo chamado', mudanca: 'Mudança de chamado', desobrigacao: 'Só desobrigação' };

// Entrevistas: só tipo, quem entrevista, data e situação. Nunca o conteúdo.
export const TIPOS_ENT = {
    chamado: 'Chamado', desobrigacao: 'Desobrigação', templo: 'Recomendação para o templo',
    jovens: 'Entrevista de jovens', batismo: 'Batismo', ordenacao: 'Ordenação no sacerdócio', outro: 'Outro'
};
export const ENTREVISTADORES = { qualquer: 'Qualquer do bispado', bispo: 'Bispo', c1: '1º Conselheiro', c2: '2º Conselheiro' };
export const STATUS_ENT = { pendente: 'A marcar', marcada: 'Marcada', realizada: 'Realizada', cancelada: 'Cancelada' };

const quem = () => S.perfil?.nome || S.user?.email || '';
const marco = etapa => firebase.firestore.FieldValue.arrayUnion({ etapa, data: hoje(), por: quem() });
const erro = (msg) => err => { console.error(err); showToast(msg, 'error', 5000); };

// --- Utilidades ---

export function proximoDomingo(apos = hoje()) {
    const d = parseISO(apos);
    d.setDate(d.getDate() + 1);
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    return toISO(d);
}
export function somaDias(iso, n) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
}
export const ehDesob = c => c.tipo === 'desobrigacao';
export function descChamado(c) {
    if (ehDesob(c)) return `Desobrigação: ${c.chamadoAtual || '—'}`;
    return (c.chamado || 'Chamado a definir') + (c.chamadoAtual ? ` (sai de ${c.chamadoAtual})` : '');
}
const motivoEnt = c => ehDesob(c) ? `Desobrigação: ${c.chamadoAtual || ''}` : `Chamado: ${c.chamado || 'a definir'}`;
export const entrevistaDoChamado = c => S.entrevistas.find(e => e.chamadoId === c.id && e.status !== 'cancelada');
export const acaoAtrasada = a => !a.feita && a.prazo && a.prazo < hoje();
export function quandoTxt(q) {
    if (!q) return '';
    const [d, h] = q.split('T');
    const dt = parseISO(d);
    return `${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dt.getDay()]} ${formatDate(d).slice(0, 5)}${h ? ' às ' + h : ''}`;
}
// Nomes conhecidos (para sugerir ao digitar)
export function nomesConhecidos() {
    const n = new Set();
    S.oradores.forEach(o => n.add(o.nome));
    S.chamados.forEach(c => c.pessoa && n.add(c.pessoa));
    S.entrevistas.forEach(e => e.pessoa && n.add(e.pessoa));
    return [...n].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// --- Avisos de mudança para as telas ---
const ouvintes = [];
export const aoMudar = fn => ouvintes.push(fn);
const avisar = () => ouvintes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

// --- Chamados ---

export function criarChamado({ pessoa, tipo, chamado, chamadoAtual, decidido, reuniaoId, reuniaoData }) {
    const ref = col.chamados.doc();
    const c = {
        pessoa, tipo, chamado: tipo === 'desobrigacao' ? '' : chamado, chamadoAtual: tipo === 'chamado' ? '' : chamadoAtual,
        etapa: 'oracao', domingoApoio: '', reuniaoId: reuniaoId || '', reuniaoData: reuniaoData || hoje(),
        historico: [{ etapa: 'oracao', data: hoje(), por: quem() }],
        createdAt: TS(), updatedAt: TS()
    };
    if (!decidido) {
        ref.set(c).catch(erro('Erro ao salvar o chamado.'));
        return;
    }
    enviarParaEntrevista({ ...c, id: ref.id }, c);
}

// Decidido: entra na fila de entrevistas
export function enviarParaEntrevista(c, novo = null) {
    const batch = db.batch();
    const refC = col.chamados.doc(c.id);
    const refE = col.entrevistas.doc();
    batch.set(refE, {
        pessoa: c.pessoa, tipo: ehDesob(c) ? 'desobrigacao' : 'chamado', motivo: motivoEnt(c),
        entrevistador: 'qualquer', quando: '', status: 'pendente', chamadoId: c.id,
        createdAt: TS(), updatedAt: TS()
    });
    if (novo) {
        batch.set(refC, { ...novo, etapa: 'convite', entrevistaId: refE.id,
            historico: [...novo.historico, { etapa: 'convite', data: hoje(), por: quem() }] });
    } else {
        batch.set(refC, { etapa: 'convite', entrevistaId: refE.id, historico: marco('convite'), updatedAt: TS() }, { merge: true });
    }
    batch.commit().catch(erro('Erro ao enviar para a fila de entrevistas.'));
    showToast(`${c.pessoa} entrou na fila de entrevistas.`);
}

export function mudarEtapa(c, etapa, extra = {}) {
    const dados = { etapa, historico: marco(etapa), updatedAt: TS(), ...extra };
    if (etapa === 'aceito' && !c.domingoApoio && !extra.domingoApoio) dados.domingoApoio = proximoDomingo();
    if (etapa === 'apoiado') dados.apoiadoEm = extra.apoiadoEm || hoje();
    // Desobrigação termina quando é feita na reunião sacramental
    if (etapa === 'apoiado' && ehDesob(c)) { dados.etapa = 'designado'; dados.historico = marco('designado'); }
    return col.chamados.doc(c.id).set(dados, { merge: true }).catch(erro('Erro ao atualizar o chamado.'));
}

export function salvarChamado(id, dados) {
    return col.chamados.doc(id).set({ ...dados, updatedAt: TS() }, { merge: true }).catch(erro('Erro ao salvar o chamado.'));
}

export function excluirChamado(c) {
    const batch = db.batch();
    batch.delete(col.chamados.doc(c.id));
    const e = entrevistaDoChamado(c);
    if (e && e.status !== 'realizada') batch.delete(col.entrevistas.doc(e.id));
    return batch.commit().catch(erro('Erro ao excluir.'));
}

// --- Ações ---

export function criarAcao({ descricao, responsavel, prazo, reuniaoId, reuniaoData }) {
    return col.acoes.add({
        descricao, responsavel, prazo, feita: false, feitaEm: '',
        reuniaoId: reuniaoId || '', reuniaoData: reuniaoData || hoje(), createdAt: TS(), updatedAt: TS()
    }).catch(erro('Erro ao salvar a ação.'));
}
export function marcarAcao(a, feita) {
    return col.acoes.doc(a.id).set({ feita, feitaEm: feita ? hoje() : '', feitaPor: feita ? quem() : '', updatedAt: TS() }, { merge: true })
        .catch(erro('Erro ao atualizar a ação.'));
}
export const excluirAcao = a => col.acoes.doc(a.id).delete().catch(erro('Erro ao excluir.'));

// --- Entrevistas ---

export function salvarEntrevista(id, dados) {
    const status = dados.status || (dados.quando ? 'marcada' : 'pendente');
    const ref = id ? col.entrevistas.doc(id) : col.entrevistas.doc();
    const d = { ...dados, status, updatedAt: TS() };
    if (!id) Object.assign(d, { chamadoId: dados.chamadoId || '', createdAt: TS() });
    return ref.set(d, { merge: true }).catch(erro('Erro ao salvar a entrevista.'));
}

// resultado: 'aceitou' | 'recusou' | null
export function concluirEntrevista(e, resultado) {
    const batch = db.batch();
    // Se estava marcada para um dia que já passou, conta como feita naquele dia
    const dia = e.quando && e.quando.slice(0, 10) < hoje() ? e.quando.slice(0, 10) : hoje();
    batch.set(col.entrevistas.doc(e.id), { status: 'realizada', realizadaEm: dia, resultado: resultado || '', updatedAt: TS() }, { merge: true });
    const c = e.chamadoId && S.chamados.find(x => x.id === e.chamadoId);
    if (c && resultado === 'aceitou') {
        batch.set(col.chamados.doc(c.id), {
            etapa: 'aceito', domingoApoio: c.domingoApoio || proximoDomingo(), historico: marco('aceito'), updatedAt: TS()
        }, { merge: true });
    } else if (c && resultado === 'recusou') {
        batch.set(col.chamados.doc(c.id), { etapa: 'recusado', historico: marco('recusado'), updatedAt: TS() }, { merge: true });
    }
    return batch.commit().catch(erro('Erro ao salvar a entrevista.'));
}
export const cancelarEntrevista = e => col.entrevistas.doc(e.id).set({ status: 'cancelada', updatedAt: TS() }, { merge: true }).catch(erro('Erro ao cancelar.'));
export const excluirEntrevista = e => col.entrevistas.doc(e.id).delete().catch(erro('Erro ao excluir.'));

// --- Reuniões ---

export function novaReuniao(data = hoje()) {
    const ref = col.reunioes.doc();
    ref.set({ data, tipo: 'bispado', presentes: '', assuntos: '', criadoPor: quem(), createdAt: TS(), updatedAt: TS() })
        .catch(erro('Erro ao criar a reunião.'));
    return ref.id;
}
export const salvarReuniao = (id, dados) => col.reunioes.doc(id).set({ ...dados, updatedAt: TS() }, { merge: true }).catch(erro('Erro ao salvar a reunião.'));
export function excluirReuniao(r) {
    // As ações e chamados criados na reunião continuam (só perdem o vínculo)
    return col.reunioes.doc(r.id).delete().catch(erro('Erro ao excluir a reunião.'));
}

// --- Carregamento ---

let iniciado = false;
export function carregarBispado() {
    if (iniciado) return;
    iniciado = true;
    const onErr = err => { console.error(err); showToast('Erro ao carregar dados do bispado. Verifique seu acesso.', 'error', 6000); };
    col.reunioes.onSnapshot({ includeMetadataChanges: true }, s => {
        if (!ehSecretaria() && !podeAgenda()) statusDoSnapshot(s);
        S.reunioes = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
        avisar();
    }, onErr);
    col.acoes.onSnapshot(s => {
        S.acoes = s.docs.map(d => ({ id: d.id, ...d.data() }));
        avisar();
    }, onErr);
    col.chamados.onSnapshot(s => {
        S.chamados = s.docs.map(d => ({ id: d.id, ...d.data() }));
        S.chamadosCarregados = true;
        avisar();
        agendarSyncAuto();
    }, onErr);
    col.entrevistas.onSnapshot(s => {
        S.entrevistas = s.docs.map(d => ({ id: d.id, ...d.data() }));
        avisar();
    }, onErr);
    // Quem não tem a aba Agenda (ex.: secretário executivo) ainda vê as atividades na pauta
    if (!podeAgenda()) {
        col.agenda.where('data', '>=', hoje()).onSnapshot(s => {
            S.agenda = {};
            s.docs.forEach(d => { S.agenda[d.id] = { ...d.data(), data: d.id }; });
            avisar();
        }, err => console.warn('Agenda:', err));
    }
}
