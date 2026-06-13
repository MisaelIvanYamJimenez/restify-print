const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  // Cuando tengas dominio, agrega aqui:
  // 'https://tudominio.com',
];

const WS_PORT = 9632;

module.exports = { ALLOWED_ORIGINS, WS_PORT };
