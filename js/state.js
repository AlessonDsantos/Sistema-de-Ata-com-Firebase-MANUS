// Estado compartilhado entre os módulos do sistema
import { SUPERADMIN } from './firebase.js';

export const S = {
    user: null,        // usuário do Firebase Auth
    perfil: null,      // documento em usuarios/{uid}
    atas: [],
    oradores: [],
    discursos: [],
    domingos: {},
    agenda: {},        // { 'AAAA-MM-DD': atividade }
    usuarios: [],
    isDirty: false     // ata aberta com alterações não salvas
};

export const ehSuper = () => !!S.user && S.user.email === SUPERADMIN && S.user.emailVerified;
export const aprovado = () => ehSuper() || S.perfil?.status === 'aprovado';
export const temPapel = p => ehSuper() || (aprovado() && (S.perfil?.papeis || []).includes(p));
export const ehBispado = () => temPapel('bispado');
export const ehSecretaria = () => ehBispado() || temPapel('secretaria');   // atas e discursantes
export const podeAgenda = () => ehSecretaria() || temPapel('editor');

// Organizações em que a pessoa pode criar/editar atividades
export function orgsEditaveis(todas) {
    if (ehSecretaria()) return Object.keys(todas);
    if (!temPapel('editor')) return [];
    return (S.perfil?.orgs || []).filter(o => todas[o]);
}
export const podeEditarOrg = (org, todas) => orgsEditaveis(todas).includes(org);
