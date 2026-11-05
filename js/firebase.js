// Conexão com o Firebase (usada pelo sistema e pela agenda pública)

export const firebaseConfig = {
    apiKey: "AIzaSyAQvf-5TQtg4O1NKhRCwdeuvbWFzMfXsak",
    authDomain: "minhas-atas.firebaseapp.com",
    projectId: "minhas-atas",
    storageBucket: "minhas-atas.firebasestorage.app",
    messagingSenderId: "1074820300427",
    appId: "1:1074820300427:web:3ab150a7856c7c40029e8e"
};

// Administrador principal: sempre tem acesso de bispado (também garantido nas regras do Firestore)
export const SUPERADMIN = 'alessonplayer@gmail.com';

firebase.initializeApp(firebaseConfig);
export const db = firebase.firestore();
export const TS = () => firebase.firestore.FieldValue.serverTimestamp();

// Funciona sem internet: salva no aparelho e sincroniza quando a conexão voltar
db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('Persistência offline indisponível:', err.code));

export const col = {
    atas: db.collection('atasSacramentais'),
    oradores: db.collection('oradores'),
    discursos: db.collection('discursos'),
    domingos: db.collection('domingos'),
    agenda: db.collection('agenda'),
    usuarios: db.collection('usuarios')
};
