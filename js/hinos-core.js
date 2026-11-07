// Hinos: dados, assuntos e sugestões pelo tema dos discursos
import { HINOS_RAW } from './hinos-dados.js';
import { norm, parseISO, toISO } from './util.js';

const BASE = {
    h: 'https://www.churchofjesuschrist.org/study/manual/hymns/',
    n: 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/'
};

export const HINOS = HINOS_RAW.map(([num, titulo, slug, livro, assuntos, cat]) => ({
    num, titulo, slug, livro, assuntos, cat,
    url: `${BASE[livro]}${slug}?lang=por`,
    busca: norm(`${num} ${titulo}`)
}));
export const hinoPorNum = n => HINOS.find(h => h.num === +n);
export const urlHino = n => hinoPorNum(n)?.url || '';

// Assuntos: nome exibido + palavras do tema que levam a ele (sem acento, minúsculas)
export const ASSUNTOS = {
    cristo:        { nome: 'Jesus Cristo',          chaves: ['cristo', 'jesus', 'salvador', 'redentor', 'messias', 'filho de deus', 'discipulo'] },
    expiacao:      { nome: 'Expiação',              chaves: ['expiac', 'sacrifici', 'getsemani', 'cruz', 'calvario', 'graca', 'redenc', 'redim', 'resgat'] },
    sacramento:    { nome: 'Sacramento',            chaves: ['sacramento', 'santa ceia', 'lembrar dele', 'lembrar de cristo', 'emblemas'] },
    ressurreicao:  { nome: 'Ressurreição / Páscoa', chaves: ['ressurrei', 'pascoa', 'sepulcro', 'tumulo', 'ressuscit'] },
    natal:         { nome: 'Natal',                 chaves: ['natal', 'nascimento de', 'belem', 'presepio'] },
    fe:            { nome: 'Fé',                    chaves: ['fe', 'confian', 'crer', 'crenca', 'acreditar', 'milagre', 'confiar'] },
    arrependimento:{ nome: 'Arrependimento',        chaves: ['arrepend', 'perdao', 'perdoar', 'pecado', 'mudanca de coracao', 'mudar', 'recomec'] },
    convenios:     { nome: 'Convênios e batismo',   chaves: ['convenio', 'batism', 'ordenanc', 'compromisso', 'consagra', 'promessa'] },
    espirito:      { nome: 'Espírito Santo',        chaves: ['espirito', 'revelac', 'inspirac', 'discernimento', 'dom do', 'sussurro'] },
    oracao:        { nome: 'Oração',                chaves: ['oracao', 'orar', 'prece', 'orando', 'oracoes'] },
    jejum:         { nome: 'Jejum',                 chaves: ['jejum', 'jejuar'] },
    escrituras:    { nome: 'Escrituras',            chaves: ['escritura', 'livro de mormon', 'biblia', 'doutrina e convenios', 'estud', 'vem e segue', 'palavra de deus'] },
    profetas:      { nome: 'Profetas',              chaves: ['profeta', 'apostolo', 'conferencia', 'lideres', 'seguir o profeta', 'videntes'] },
    restauracao:   { nome: 'Restauração',           chaves: ['restaura', 'joseph smith', 'primeira visao', 'pioneir', 'siao', 'igreja verdadeira'] },
    sacerdocio:    { nome: 'Sacerdócio',            chaves: ['sacerdocio', 'autoridade', 'elder', 'quorum', 'chaves'] },
    templo:        { nome: 'Templo e história da família', chaves: ['templo', 'historia da familia', 'genealogia', 'selamento', 'antepassad', 'casa do senhor', 'lugares santos', 'investidura'] },
    familia:       { nome: 'Família e lar',         chaves: ['familia', 'lar', 'casamento', 'pais', 'filhos', 'mae', 'maes', 'maternidade', 'paternidade', 'proclamacao', 'conjuge'] },
    amor:          { nome: 'Amor e caridade',       chaves: ['amor', 'caridade', 'amar', 'bondade', 'gentileza', 'unidade', 'amizade', 'compaixao', 'amai-vos', 'inclus'] },
    servico:       { nome: 'Serviço',               chaves: ['servi', 'ministra', 'ajudar', 'trabalho', 'chamado', 'autossufici', 'bem-estar', 'ensinar'] },
    missao:        { nome: 'Obra missionária',      chaves: ['mission', 'compartilhar', 'pregar', 'reunir israel', 'coligac', 'convidar', 'evangelho ao mundo', 'proclamar'] },
    obediencia:    { nome: 'Obediência e escolhas', chaves: ['obedi', 'mandamento', 'retidao', 'escolha', 'arbitrio', 'dizimo', 'palavra de sabedoria', 'integridade', 'honestidade', 'pureza', 'castidade', 'moral', 'padroes'] },
    gratidao:      { nome: 'Gratidão',              chaves: ['gratid', 'agradec', 'bencao', 'bencaos', 'gracas', 'grato'] },
    consolo:       { nome: 'Paz e consolo',         chaves: ['paz', 'consolo', 'conforto', 'provac', 'aflic', 'dificuldade', 'esperanca', 'adversidade', 'tristeza', 'luto', 'ansiedade', 'medo', 'cura', 'fardo', 'resilien', 'sofrimento'] },
    pai:           { nome: 'Pai Celestial',         chaves: ['pai celest', 'deus', 'filhos de deus', 'identidade', 'natureza divina', 'pai eterno'] },
    plano:         { nome: 'Plano de salvação',     chaves: ['plano de salvac', 'plano de felicidade', 'vida eterna', 'eternidade', 'morte', 'vida apos', 'exaltac', 'proposito'] },
    sabado:        { nome: 'Dia do Senhor',         chaves: ['dia do senhor', 'sabado', 'domingo', 'santificar', 'dia santo'] },
    criacao:       { nome: 'Criação e natureza',    chaves: ['criac', 'natureza', 'criador', 'mundo que'] },
    louvor:        { nome: 'Louvor e alegria',      chaves: ['louvor', 'adorac', 'alegria', 'louvar', 'regozij', 'musica', 'hino', 'felicidade'] },
    perseveranca:  { nome: 'Perseverança e coragem',chaves: ['persever', 'firme', 'coragem', 'ate o fim', 'fortal', 'forca', 'tentac', 'armadura', 'perseguic', 'fieis', 'fidelidade', 'resistir'] },
    jovens:        { nome: 'Jovens e crianças',     chaves: ['jovem', 'jovens', 'juventude', 'rapazes', 'mocas', 'criancas', 'primaria'] },
    humildade:     { nome: 'Humildade e paciência', chaves: ['humild', 'mansid', 'submiss', 'paciencia', 'orgulho', 'mansos'] },
    luz:           { nome: 'Luz e verdade',         chaves: ['luz', 'verdade', 'exemplo'] },
    testemunho:    { nome: 'Testemunho e conversão',chaves: ['testemunh', 'conversao', 'convert', 'conhecimento'] },
    segundavinda:  { nome: 'Segunda Vinda',         chaves: ['segunda vinda', 'milenio', 'ultimos dias', 'sinais', 'prepar'] }
};

// Expressões já prontas (início de palavra) para identificar assuntos num texto
const REGEX = Object.fromEntries(Object.entries(ASSUNTOS).map(([k, a]) =>
    [k, new RegExp('(^|[^a-z])(' + a.chaves.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'i')]));

export function assuntosDoTexto(texto) {
    const t = norm(texto);
    return Object.keys(ASSUNTOS).filter(k => REGEX[k].test(t));
}

// Domingo de Páscoa (algoritmo de Meeus)
function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return toISO(new Date(ano, mes - 1, dia));
}
const pertoDaPascoa = iso => {
    const p = parseISO(pascoa(parseISO(iso).getFullYear()));
    const dif = (p - parseISO(iso)) / 864e5;
    return dif >= 0 && dif <= 7;   // domingo de Páscoa ou o anterior
};
// Palavras comuns demais para indicar o assunto
const COMUNS = new Set(['jesus', 'cristo', 'senhor', 'deus', 'nosso', 'nossa', 'nossos', 'como', 'para', 'pelo', 'pela', 'sobre', 'todos', 'todo', 'toda', 'cada', 'meus', 'minha', 'teus', 'vinde', 'hoje', 'importancia', 'poder', 'quando', 'onde']);
const palavras = t => norm(t).split(/[^a-z]+/).filter(w => w.length >= 4 && !COMUNS.has(w));
// Assuntos muito amplos valem menos que os específicos (ex.: "Expiação" pesa mais que "Jesus Cristo")
const PESO = { cristo: 1, pai: 1, louvor: 1, consolo: 2, obediencia: 2, servico: 2 };

// Sugestões para um momento da reunião ('abertura' | 'sacramental' | 'intermediario' | 'final')
export function sugerir(temas, momento, dataISO, limite = 12) {
    if (momento === 'sacramental') {
        return HINOS.filter(h => h.cat === 'sacramental').map(h => ({ hino: h, motivo: ['Sacramento'] }));
    }
    const texto = temas.join(' ');
    const alvo = assuntosDoTexto(texto);
    const pals = new Set(palavras(texto));
    const dezembro = parseISO(dataISO).getMonth() === 11;
    const pascoaPerto = pertoDaPascoa(dataISO);

    const lista = [];
    HINOS.forEach(h => {
        if (h.cat === 'sacramental' && h.livro === 'h') return;            // 98 a 117: só no sacramento
        if (h.cat === 'natal' && !dezembro && !alvo.includes('natal')) return;
        if (h.cat === 'pascoa' && !pascoaPerto && !alvo.includes('ressurreicao')) return;
        const comuns = h.assuntos.filter(a => alvo.includes(a));
        let pontos = comuns.reduce((t, a) => t + (PESO[a] ?? 3), 0);
        if (comuns.length > 1) pontos += comuns.length;   // combina vários assuntos do tema
        const noTitulo = palavras(h.titulo).filter(w => pals.has(w)).length;
        pontos += noTitulo * 3;
        if (dezembro && h.cat === 'natal') pontos += 2;
        if (pascoaPerto && h.cat === 'pascoa') pontos += 2;
        if (pontos > 0) lista.push({ hino: h, pontos, motivo: comuns.map(a => ASSUNTOS[a].nome) });
    });
    return lista.sort((a, b) => b.pontos - a.pontos || a.hino.num - b.hino.num).slice(0, limite);
}
