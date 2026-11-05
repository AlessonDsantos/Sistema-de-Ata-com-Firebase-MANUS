// Modo leitura de ata
import { S } from './state.js';
import { $, esc, dataPorExtenso, showToast } from './util.js';
import { collectForm, editAta, hymn, mostrarMTab } from './atas.js';
import { vaiParaAta } from './discursantes.js';
import { mostrarTela } from './nav.js';

let leitorId = null;
let leitorDados = null;
const FONTES_LEITOR = [1, 1.15, 1.3, 0.9];
let fonteLeitor = 1;

export function abrirLeitor(id) {
    let ata = null;
    if (id) {
        ata = S.atas.find(a => a.id === id);
    } else if ($('ata-id').value || $('data').value) {
        // Ata aberta no formulário: mostra o que está na tela, mesmo sem salvar
        ata = { ...collectForm(), id: $('ata-id').value || null, _naoSalva: S.isDirty || !$('ata-id').value };
    } else {
        ata = S.atas[0];
    }
    if (!ata) { showToast('Ainda não há atas para ler.', 'error'); return; }
    leitorId = ata.id || null;
    leitorDados = ata;
    renderLeitor();
    if ($('leitor').classList.contains('hidden')) {
        $('leitor').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        // O botão "voltar" do celular fecha a leitura em vez de sair do app
        try { history.pushState({ leitor: true }, ''); } catch (e) {}
    }
    $('leitor-conteudo').scrollTop = 0;
}

function fecharLeitor(porVoltar) {
    if ($('leitor').classList.contains('hidden')) return;
    $('leitor').classList.add('hidden');
    if (!document.querySelector('.modal-overlay:not(.hidden)')) document.body.style.overflow = '';
    if (!porVoltar && history.state?.leitor) history.back();
}

function renderLeitor() {
    const a = leitorDados;
    const isTest = a.tipo_ata === 'testemunho';
    const v = x => String(x ?? '').trim();
    const vazio = '<span class="lt-vazio">—</span>';
    const campo = (l, val) => `<div class="lt-campo"><span class="lt-l">${l}</span><span class="lt-v">${v(val) ? esc(v(val)) : vazio}</span></div>`;
    const bloco = (l, val) => v(val) ? `<div class="lt-bloco"><span class="lt-l">${l}</span><div class="lt-v">${esc(v(val))}</div></div>` : '';
    const secao = (t, html) => `<div class="lt-secao"><h3>${t}</h3>${html}</div>`;

    // Tema e tempo vêm do controle de discursantes
    const orador = (rotulo, nome, slot) => {
        const extras = S.discursos
            .filter(d => d.data === a.data && d.slot === slot && vaiParaAta(d) && (d.tema || d.tempo))
            .map(d => `<div class="lt-tema">${d.tema ? esc(d.tema) : ''}${d.tema && d.tempo ? ' · ' : ''}${d.tempo ? d.tempo + ' min' : ''}</div>`)
            .join('');
        return `<div class="lt-orador"><div class="lt-l">${rotulo}</div><div class="lt-nome">${v(nome) ? esc(v(nome)) : vazio}</div>${extras}</div>`;
    };

    $('leitor-tipo').textContent = (isTest ? 'Reunião de Testemunho' : 'Reunião Sacramental') + (a._naoSalva ? ' · não salva' : '');
    $('leitor-data').textContent = dataPorExtenso(a.data);

    let html = '';
    html += secao('Informações gerais',
        campo('Presidida por', a.presidida_por) + campo('Dirigida por', a.dirigida_por) +
        campo('Frequência', a.frequencia) + campo('Regente', a.regente) +
        campo('Pianista/Organista', a.pianista) + campo('Ala', [a.ala, a.estaca && `Estaca ${a.estaca}`].filter(Boolean).join(' · ')));
    html += secao('Abertura',
        bloco('Boas-vindas / Reconhecimentos', a.boas_vindas) + bloco('Anúncios', a.anuncios) +
        campo('Hino de abertura', hymn(a.hino_abertura, a.hino_abertura_num)) + campo('1ª oração', a.primeira_oracao));
    html += secao('Ações', v(a.acoes) ? `<div class="lt-bloco"><div class="lt-v">${esc(v(a.acoes))}</div></div>` : '<div class="lt-vazio">Nenhuma ordenança, desobrigação ou apoio.</div>');
    html += secao('Sacramento', campo('Hino sacramental', hymn(a.hino_sacramental, a.hino_sacramental_num)));
    if (isTest) {
        const nomes = v(a.testemunhos_lista).split('\n').map(s => s.trim()).filter(Boolean);
        html += secao(`Testemunhos (${nomes.length})`, nomes.length
            ? `<div class="lt-nomes">${nomes.map(n => `<div>${esc(n)}</div>`).join('')}</div>`
            : '<div class="lt-vazio">Nenhum nome registrado.</div>');
    } else {
        const inter = hymn(a.interludio, a.interludio_num);
        html += secao('Mensagens',
            orador('1º orador', a.primeiro_orador, 1) + orador('2º orador', a.segundo_orador, 2) +
            `<div class="lt-orador"><div class="lt-l">Interlúdio musical</div><div>${v(inter) ? esc(inter) : vazio}</div></div>` +
            orador('Último orador', a.ultimo_orador, 3) + bloco('Observações', a.observacoes));
    }
    html += secao('Encerramento', campo('Último hino', hymn(a.hino_encerramento, a.hino_encerramento_num)) + campo('Última oração', a.ultima_oracao));
    $('leitor-conteudo').innerHTML = `<div class="leitor-pagina">${html}</div>`;

    // Navegação: a lista vai da mais recente para a mais antiga
    const i = leitorId ? S.atas.findIndex(x => x.id === leitorId) : -1;
    $('leitor-ant').disabled = i < 0 || i >= S.atas.length - 1;
    $('leitor-prox').disabled = i <= 0;
}

function navegarLeitor(passo) {
    const i = leitorId ? S.atas.findIndex(x => x.id === leitorId) : -1;
    const alvo = S.atas[i + passo];
    if (i < 0 || !alvo) return;
    leitorId = alvo.id;
    leitorDados = alvo;
    renderLeitor();
    $('leitor-conteudo').scrollTop = 0;
}

export function initLeitor() {
    try { fonteLeitor = +localStorage.getItem('fonteLeitor') || 1; } catch (e) {}
    $('leitor').style.setProperty('--lf', fonteLeitor);

    $('leitor-fechar').addEventListener('click', () => fecharLeitor(false));
    $('leitor-ant').addEventListener('click', () => navegarLeitor(1));
    $('leitor-prox').addEventListener('click', () => navegarLeitor(-1));
    $('leitor-fonte').addEventListener('click', () => {
        fonteLeitor = FONTES_LEITOR[(FONTES_LEITOR.indexOf(fonteLeitor) + 1) % FONTES_LEITOR.length];
        $('leitor').style.setProperty('--lf', fonteLeitor);
        try { localStorage.setItem('fonteLeitor', fonteLeitor); } catch (e) {}
        showToast(`Letra em ${Math.round(fonteLeitor * 100)}%`, 'info', 1200);
    });
    $('leitor-editar').addEventListener('click', () => {
        const id = leitorId;
        fecharLeitor(false);
        mostrarTela('atas');
        if (id) editAta(id); else mostrarMTab('form');
    });
    window.addEventListener('popstate', () => fecharLeitor(true));
    document.addEventListener('keydown', e => {
        if ($('leitor').classList.contains('hidden')) return;
        if (e.key === 'Escape') fecharLeitor(false);
        else if (e.key === 'ArrowLeft') navegarLeitor(1);
        else if (e.key === 'ArrowRight') navegarLeitor(-1);
    });
    // Deslizar o dedo para o lado troca de ata
    let toqueX = 0, toqueY = 0;
    $('leitor-conteudo').addEventListener('touchstart', e => { toqueX = e.touches[0].clientX; toqueY = e.touches[0].clientY; }, { passive: true });
    $('leitor-conteudo').addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - toqueX, dy = e.changedTouches[0].clientY - toqueY;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 50) navegarLeitor(dx > 0 ? 1 : -1);
    }, { passive: true });
}
