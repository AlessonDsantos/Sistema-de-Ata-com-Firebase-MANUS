// Atas: formulário, lista, PDF e backup
import { db, col, TS } from './firebase.js';
import { S } from './state.js';
import { $, esc, norm, formatDate, showToast, updateStatus, statusDoSnapshot } from './util.js';
import { nomesDoDia } from './discursantes.js';
import { abrirLeitor } from './leitor.js';
import { hinosParaAta, agendarSyncHinosAtas } from './hinos.js';

// Todos os campos do formulário (id do elemento = nome do campo no Firestore)
const FIELDS = [
    'tipo_ata', 'estaca', 'ala', 'data', 'presidida_por', 'dirigida_por', 'frequencia', 'regente', 'pianista',
    'boas_vindas', 'anuncios', 'hino_abertura', 'hino_abertura_num', 'primeira_oracao', 'acoes',
    'hino_sacramental', 'hino_sacramental_num',
    'primeiro_orador', 'segundo_orador', 'interludio', 'interludio_num', 'ultimo_orador', 'observacoes',
    'testemunhos_lista',
    'hino_encerramento', 'hino_encerramento_num', 'ultima_oracao'
];
const SACRAMENTAL_ONLY = ['primeiro_orador', 'segundo_orador', 'interludio', 'interludio_num', 'ultimo_orador', 'observacoes'];

let currentFilter = '';
let form, listContainer, tipoAtaSelect;
let formHinosVersao = 0;   // versão dos hinos que o formulário aberto já mostra

// --- Utilitários do formulário ---

function setDirty(v) {
    S.isDirty = v;
    $('dirty-badge').classList.toggle('hidden', !v);
}

export function confirmDiscard() {
    return !S.isDirty || confirm('Há alterações não salvas nesta ata. Deseja descartá-las?');
}

function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
}
const growAll = () => form.querySelectorAll('textarea').forEach(autoGrow);

function toggleSections() {
    const sac = tipoAtaSelect.value === 'sacramental';
    $('section-mensagens').classList.toggle('hidden', !sac);
    $('section-testemunhos').classList.toggle('hidden', sac);
    growAll();
}

export function collectForm() {
    const data = {};
    FIELDS.forEach(k => { data[k] = $(k).value; });
    if (data.tipo_ata === 'sacramental') data.testemunhos_lista = '';
    else SACRAMENTAL_ONLY.forEach(k => { data[k] = ''; });
    return data;
}

function fillForm(ata) {
    FIELDS.forEach(k => { $(k).value = ata[k] ?? ''; });
    formHinosVersao = ata.hinosVersao || 0;
    if (!tipoAtaSelect.value) tipoAtaSelect.value = 'sacramental';
    toggleSections();
}

// Usado pelo controle de discursantes para manter a ata aberta em dia
export function formAtual() {
    return { id: $('ata-id').value, data: $('data').value, tipo: tipoAtaSelect.value };
}
export function preencherOradores(nomes) {
    Object.entries(nomes).forEach(([k, v]) => { $(k).value = v; });
}

export function mostrarMTab(t) {
    document.body.classList.toggle('mtab-lista', t === 'lista');
    document.body.classList.toggle('mtab-form', t === 'form');
    document.querySelectorAll('[data-mtab]').forEach(b => b.classList.toggle('active', b.dataset.mtab === t));
    if (window.innerWidth <= 1024) window.scrollTo({ top: 0 });
}

function clearForm() {
    if (!confirmDiscard()) return;
    form.reset();
    formHinosVersao = 0;
    $('ata-id').value = '';
    $('form-mode-title').textContent = 'Nova Ata';
    setDirty(false);
    toggleSections();
    renderList();
    mostrarMTab('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function editAta(id) {
    if (id === $('ata-id').value) { mostrarMTab('form'); return; }
    const ata = S.atas.find(a => a.id === id);
    if (!ata || !confirmDiscard()) return;
    mostrarMTab('form');
    $('ata-id').value = ata.id;
    $('form-mode-title').textContent = 'Editando Ata de ' + formatDate(ata.data);
    fillForm(ata);
    setDirty(false);
    renderList();
    if (window.innerWidth <= 1024) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Dados ---

function sortAtas(list) {
    // Mais recente primeiro pela data da reunião, não pela data em que foi digitada
    return list.sort((a, b) => (b.data || '').localeCompare(a.data || '') ||
        ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
}

function loadAtas() {
    updateStatus('connecting');
    col.atas.onSnapshot({ includeMetadataChanges: true }, snapshot => {
        S.atas = sortAtas(snapshot.docs.map(doc => ({ id: doc.id, _pending: doc.metadata.hasPendingWrites, ...doc.data() })));
        S.atasCarregadas = true;
        renderList();
        statusDoSnapshot(snapshot);
        agendarSyncHinosAtas();
    }, error => {
        console.error('Erro no snapshot:', error);
        updateStatus('erro');
        listContainer.innerHTML = '<p class="empty-msg">Não foi possível carregar as atas.</p>';
    });
}

function renderList() {
    const terms = norm(currentFilter).split(/\s+/).filter(Boolean);
    const filtered = S.atas.filter(ata => {
        if (!terms.length) return true;
        const hay = norm([
            formatDate(ata.data), ata.data, ata.ala, ata.dirigida_por, ata.presidida_por,
            ata.tipo_ata === 'testemunho' ? 'testemunho' : 'sacramental',
            ata.primeiro_orador, ata.segundo_orador, ata.ultimo_orador
        ].join(' '));
        return terms.every(t => hay.includes(t));
    });

    $('ata-count').textContent = S.atas.length ? `(${filtered.length}${filtered.length !== S.atas.length ? ' de ' + S.atas.length : ''})` : '';

    if (filtered.length === 0) {
        listContainer.innerHTML = '<p class="empty-msg">Nenhuma ata encontrada.</p>';
        return;
    }

    const activeId = $('ata-id').value;
    listContainer.innerHTML = filtered.map(ata => {
        const isTest = ata.tipo_ata === 'testemunho';
        const nTest = (ata.testemunhos_lista || '').split('\n').filter(s => s.trim()).length;
        const detalhe = isTest
            ? `<div><strong>Testemunhos:</strong> ${nTest}</div>`
            : `<div><strong>Oradores:</strong> ${esc([ata.primeiro_orador, ata.segundo_orador, ata.ultimo_orador].filter(Boolean).join(', ') || '-')}</div>`;
        return `
        <div class="ata-item ${activeId === ata.id ? 'active' : ''}" data-id="${esc(ata.id)}" data-action="edit">
            <div class="ata-item-header">
                <span class="ata-type-badge badge-${isTest ? 'testemunho' : 'sacramental'}">${isTest ? 'Testemunho' : 'Sacramental'}</span>
                <span style="font-weight: 600;">${esc(formatDate(ata.data))}${ata._pending ? '<span class="pending-tag" title="Aguardando sincronização"><i class="fas fa-cloud-arrow-up"></i></span>' : ''}</span>
            </div>
            <div class="ata-item-info">
                <div><strong>Dirigida por:</strong> ${esc(ata.dirigida_por || '-')}</div>
                ${detalhe}
            </div>
            <div class="ata-item-actions">
                <button class="btn btn-success btn-icon" data-action="ler" title="Ler (modo leitura)"><i class="fas fa-book-open"></i> Ler</button>
                <button class="btn btn-secondary btn-icon" data-action="edit" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn btn-primary btn-icon" data-action="pdf" title="Gerar PDF"><i class="fas fa-file-pdf"></i></button>
                <button class="btn btn-danger btn-icon" data-action="delete" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

async function deleteAta(id) {
    const ata = S.atas.find(a => a.id === id);
    if (!ata) return;
    const nome = `${ata.tipo_ata === 'testemunho' ? 'Testemunho' : 'Sacramental'} de ${formatDate(ata.data)}`;
    if (!confirm(`Excluir a ata "${nome}"?\n\nIsso não pode ser desfeito. Se não tiver certeza, exporte um backup antes.`)) return;
    try {
        const p = col.atas.doc(id).delete();
        if ($('ata-id').value === id) { setDirty(false); clearForm(); mostrarMTab('lista'); }
        showToast('Ata excluída.');
        await p;
    } catch (error) {
        console.error(error);
        showToast('Erro ao excluir ata', 'error');
    }
}

function saveAta() {
    const id = $('ata-id').value;
    const formData = collectForm();

    if (!formData.data) {
        showToast('Preencha a data da reunião.', 'error');
        $('data').focus();
        return false;
    }

    // Aviso de possível duplicata (mesma data e mesmo tipo)
    const dup = S.atas.find(a => a.id !== id && a.data === formData.data && a.tipo_ata === formData.tipo_ata);
    if (dup && !confirm(`Já existe uma ata deste tipo em ${formatDate(formData.data)}. Salvar mesmo assim?`)) return false;

    formData.updatedAt = TS();
    const ref = id ? col.atas.doc(id) : col.atas.doc();
    if (!id) formData.createdAt = TS();

    // Não espera o servidor: com a persistência offline a gravação local é imediata.
    ref.set(formData, { merge: true }).catch(error => {
        console.error('Erro ao salvar:', error);
        showToast('Erro ao salvar ata. Tente novamente.', 'error', 5000);
        setDirty(true);
    });

    $('ata-id').value = ref.id;
    $('form-mode-title').textContent = 'Editando Ata de ' + formatDate(formData.data);
    setDirty(false);
    showToast(id ? 'Ata atualizada!' : 'Ata criada!');
    return true;
}

// --- Backup ---

function exportBackup() {
    const strip = arr => arr.map(({ _pending, ...rest }) => rest);
    const payload = {
        versao: 3,
        exportadoEm: new Date().toISOString(),
        atas: strip(S.atas),
        oradores: strip(S.oradores),
        discursos: strip(S.discursos),
        domingos: Object.entries(S.domingos).map(([id, v]) => ({ id, ...v })),
        agenda: Object.entries(S.agenda).map(([id, v]) => ({ ...v, id }))
    };
    if (!payload.atas.length && !payload.oradores.length && !payload.discursos.length && !payload.agenda.length) {
        showToast('Não há dados para exportar', 'error');
        return;
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_ala_vila_matilde_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Backup exportado: ${payload.atas.length} atas, ${payload.oradores.length} oradores, ${payload.discursos.length} discursos, ${payload.agenda.length} atividades.`, 'success', 4500);
}

const toTimestamp = v => (v && typeof v.seconds === 'number')
    ? new firebase.firestore.Timestamp(v.seconds, v.nanoseconds || 0)
    : null;

function importBackup(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            // Backup antigo = lista de atas; backup novo = objeto com cada coleção
            const grupos = Array.isArray(data) ? { atas: data } : (data || {});
            const plano = [
                ['atas', col.atas, 'atas'], ['oradores', col.oradores, 'oradores'], ['discursos', col.discursos, 'discursos'],
                ['domingos', col.domingos, 'domingos marcados'], ['agenda', col.agenda, 'atividades da agenda']
            ].filter(([k]) => Array.isArray(grupos[k]) && grupos[k].length);
            if (!plano.length) throw new Error('Formato inválido');
            const resumo = plano.map(([k, , nome]) => `${grupos[k].length} ${nome}`).join(', ');
            if (!confirm(`Importar ${resumo}?\n\nRegistros que já existem (mesmo ID) serão atualizados, não duplicados.`)) return;

            updateStatus('saving');
            for (const [k, colecao] of plano) {
                const itens = grupos[k];
                // O Firestore aceita no máximo 500 operações por lote
                for (let i = 0; i < itens.length; i += 400) {
                    const batch = db.batch();
                    itens.slice(i, i + 400).forEach(item => {
                        const { id, _pending, ...rest } = item;
                        if (k !== 'domingos') {
                            rest.createdAt = toTimestamp(rest.createdAt) || TS();
                            rest.updatedAt = toTimestamp(rest.updatedAt) || TS();
                        }
                        batch.set(id ? colecao.doc(id) : colecao.doc(), rest);
                    });
                    await batch.commit();
                }
            }
            showToast(`Importado: ${resumo}.`);
        } catch (error) {
            console.error('Erro na importação:', error);
            showToast('Erro ao importar backup. Verifique o arquivo.', 'error', 5000);
            updateStatus('erro');
        }
    };
    reader.readAsText(file);
}

// --- PDF (sempre tenta caber em 1 folha) ---

const PT_TO_MM = 0.3528;
const LHF = 1.25;          // fator de entrelinha
const MIN_SCALE = 0.6;     // menor redução de fonte aceita (≈ 5,7pt)

export const hymn = (name, num) => [num ? `Nº ${num}` : '', (name || '').trim()].filter(Boolean).join(' - ');

function layoutPDF(a, s, allowBreak) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    const M = 15, CW = W - M * 2, LIMIT = H - 12;
    const fs = 9.5 * s;
    const lh = fs * PT_TO_MM * LHF;
    const gap = 1.6 * s;
    let y = 16;

    const ensure = h => { if (allowBreak && y + h > LIMIT) { pdf.addPage(); y = 16; } };
    const setLabel = () => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(fs); pdf.setTextColor(100, 100, 100); };
    const setValue = () => { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(fs); pdf.setTextColor(0, 0, 0); };

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(13 * s);
    pdf.text('A IGREJA DE JESUS CRISTO DOS SANTOS DOS ÚLTIMOS DIAS', W / 2, y, { align: 'center' });
    y += 6.5 * s;
    pdf.setFontSize(11 * s);
    pdf.text(a.tipo_ata === 'testemunho' ? 'ATA DA REUNIÃO DE TESTEMUNHO' : 'ATA DA REUNIÃO SACRAMENTAL', W / 2, y, { align: 'center' });
    y += 10 * s;

    const section = title => {
        const h = 6 * s;
        ensure(h + lh * 2);
        const top = y - lh + gap;
        pdf.setFillColor(238, 240, 242);
        pdf.rect(M, top, CW, h, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(fs);
        pdf.setTextColor(44, 62, 80);
        pdf.text(title.toUpperCase(), M + 2, top + h * 0.7);
        y = top + h + lh + gap * 0.6;
    };

    // Linha com campos lado a lado; cada valor quebra dentro da própria coluna
    const row = items => {
        let x = M;
        const cells = items.map(([label, value, frac]) => {
            const w = CW * frac;
            setLabel();
            const lab = label + ': ';
            const lw = pdf.getTextWidth(lab);
            setValue();
            const lines = pdf.splitTextToSize(String(value ?? '').trim() || '__________', Math.max(w - lw - 3, 12));
            const cell = { x, lab, lw, lines };
            x += w;
            return cell;
        });
        const maxLines = Math.max(...cells.map(c => c.lines.length));
        ensure(maxLines * lh);
        cells.forEach(c => {
            setLabel(); pdf.text(c.lab, c.x, y);
            setValue(); pdf.text(c.lines, c.x + c.lw, y, { lineHeightFactor: LHF });
        });
        y += maxLines * lh + gap;
    };

    // Bloco de texto livre em largura total
    const block = (label, value) => {
        const txt = String(value ?? '').trim();
        setLabel();
        const lab = label + ': ';
        if (!txt) {
            ensure(lh);
            pdf.text(lab, M, y);
            setValue(); pdf.text('-', M + pdf.getTextWidth(lab), y);
            y += lh + gap;
            return;
        }
        ensure(lh * 2);
        pdf.text(lab, M, y);
        y += lh;
        setValue();
        pdf.splitTextToSize(txt, CW).forEach(line => {
            ensure(lh);
            pdf.text(line, M, y);
            y += lh;
        });
        y += gap;
    };

    section('Informações Gerais');
    row([['Estaca', a.estaca, 1 / 3], ['Ala', a.ala, 1 / 3], ['Data', formatDate(a.data), 1 / 3]]);
    row([['Presidida por', a.presidida_por, 1 / 3], ['Dirigida por', a.dirigida_por, 1 / 3], ['Frequência', a.frequencia, 1 / 3]]);
    row([['Regente', a.regente, 1 / 3], ['Pianista/Organista', a.pianista, 2 / 3]]);

    section('Abertura');
    block('Boas-vindas / Reconhecimentos', a.boas_vindas);
    block('Anúncios', a.anuncios);
    row([['Hino de abertura', hymn(a.hino_abertura, a.hino_abertura_num), 0.6], ['1ª oração', a.primeira_oracao, 0.4]]);

    section('Ações');
    block('Ordenanças / Desobrigações / Apoios', a.acoes);

    section('Sacramento');
    row([['Hino sacramental', hymn(a.hino_sacramental, a.hino_sacramental_num), 1]]);

    if (a.tipo_ata === 'testemunho') {
        section('Testemunhos');
        const nomes = (a.testemunhos_lista || '').split('\n').map(n => n.trim()).filter(Boolean);
        block(`Prestaram testemunho (${nomes.length})`, nomes.join(', '));
    } else {
        section('Mensagens');
        row([['1º orador', a.primeiro_orador, 0.5], ['2º orador', a.segundo_orador, 0.5]]);
        row([['Interlúdio', hymn(a.interludio, a.interludio_num), 0.5], ['Último orador', a.ultimo_orador, 0.5]]);
        block('Observações', a.observacoes);
    }

    section('Encerramento');
    row([['Último hino', hymn(a.hino_encerramento, a.hino_encerramento_num), 0.6], ['Última oração', a.ultima_oracao, 0.4]]);

    return { pdf, bottom: y - lh, limit: LIMIT };
}

function generatePDF(ata) {
    // Reduz a fonte em passos de 5% até tudo caber em uma folha
    for (let s = 1; s >= MIN_SCALE - 1e-9; s -= 0.05) {
        const r = layoutPDF(ata, s, false);
        if (r.bottom <= r.limit) {
            r.pdf.save(`Ata_${ata.tipo_ata === 'testemunho' ? 'Testemunho' : 'Sacramental'}_${ata.data}.pdf`);
            if (s < 0.999) showToast(`PDF gerado em 1 folha (fonte reduzida para ${Math.round(s * 100)}%).`, 'info', 4000);
            return;
        }
    }
    layoutPDF(ata, MIN_SCALE, true).pdf.save(`Ata_${ata.tipo_ata}_${ata.data}.pdf`);
    showToast('Conteúdo longo demais: o PDF precisou de 2 folhas. Resuma anúncios ou ações.', 'error', 6000);
}

// --- Inicialização ---

export function initAtas() {
    form = $('ata-form');
    listContainer = $('ata-list');
    tipoAtaSelect = $('tipo_ata');

    tipoAtaSelect.addEventListener('change', toggleSections);
    form.addEventListener('input', e => {
        setDirty(true);
        if (e.target.tagName === 'TEXTAREA') autoGrow(e.target);
    });
    form.addEventListener('submit', e => { e.preventDefault(); saveAta(); });

    $('btn-nova').addEventListener('click', clearForm);
    $('btn-salvar').addEventListener('click', e => { e.preventDefault(); saveAta(); });
    $('btn-ler').addEventListener('click', () => abrirLeitor(null));

    // Gera o PDF do que está na tela, salvando antes se houver alterações
    $('btn-pdf').addEventListener('click', () => {
        const data = collectForm();
        if (!data.data) { showToast('Preencha a data antes de gerar o PDF.', 'error'); $('data').focus(); return; }
        if (S.isDirty || !$('ata-id').value) { if (!saveAta()) return; }
        generatePDF(data);
    });

    $('btn-exportar').addEventListener('click', exportBackup);
    $('btn-importar-trigger').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', importBackup);

    $('search-input').addEventListener('input', e => {
        currentFilter = e.target.value;
        renderList();
    });

    listContainer.addEventListener('click', e => {
        const item = e.target.closest('.ata-item');
        if (!item) return;
        const action = e.target.closest('[data-action]')?.dataset.action;
        const id = item.dataset.id;
        if (action === 'pdf') {
            const ata = S.atas.find(a => a.id === id);
            if (ata) generatePDF(ata);
        } else if (action === 'ler') {
            abrirLeitor(id);
        } else if (action === 'delete') {
            deleteAta(id);
        } else {
            editAta(id);
        }
    });

    // Ao escolher a data de uma ata, preenche os oradores confirmados
    $('data').addEventListener('change', () => {
        if (tipoAtaSelect.value !== 'sacramental' || !$('data').value) return;
        const nomes = nomesDoDia($('data').value);
        let preencheu = false;
        Object.entries(nomes).forEach(([k, v]) => {
            if (v && !$(k).value.trim()) { $(k).value = v; preencheu = true; }
        });
        if (preencheu) showToast('Oradores preenchidos com os discursantes confirmados.', 'info');
    });

    // Hinos escolhidos pela líder de música
    const preencherHinos = (forcar) => {
        const data = $('data').value;
        const h = S.hinos[data];
        const campos = data && hinosParaAta(data, tipoAtaSelect.value);
        if (!campos || !h?.versao) return false;
        let mudou = false;
        Object.entries(campos).forEach(([k, v]) => {
            if ((forcar || !$(k).value.trim()) && $(k).value !== v) { $(k).value = v; mudou = true; }
        });
        formHinosVersao = h.versao;
        return mudou;
    };
    $('data').addEventListener('change', () => {
        if (preencherHinos(false)) showToast('Hinos preenchidos com a escolha da líder de música.', 'info');
    });
    document.addEventListener('hinos-mudaram', () => {
        const h = S.hinos[$('data').value];
        if (!h?.versao || h.versao <= formHinosVersao) return;
        if (S.isDirty) showToast('A líder de música mudou os hinos deste domingo. Confira os hinos antes de salvar.', 'info', 6000);
        else preencherHinos(true);
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (!$('view-atas').classList.contains('hidden')) saveAta();
        }
    });
    window.addEventListener('beforeunload', e => {
        if (S.isDirty) { e.preventDefault(); e.returnValue = ''; }
    });

    document.querySelectorAll('[data-mtab]').forEach(b => b.addEventListener('click', () => mostrarMTab(b.dataset.mtab)));
    mostrarMTab('lista');

    loadAtas();
    toggleSections();
}
