#!/bin/bash

# 1. Garante .env no .gitignore
if ! grep -q "^.env$" .gitignore; then
  echo ".env" >> .gitignore
  echo "Adicionado .env ao .gitignore."
fi

# 2. Cria/atualiza .env.example
cat > .env.example <<EOL
NODE_ENV=production
PORT=4040
MONGO_URI=coloque_sua_string_de_conexao_aqui
SECRET_KEY=coloque_um_segredo_forte_aqui
EOL
echo "Arquivo .env.example criado/atualizado."

# 3. Atualiza o session secret no server.js
if grep -q "secret: 'corujao-secret'" server.js; then
  sed -i "s/secret: 'corujao-secret'/secret: process.env.SECRET_KEY || 'corujao-secret'/g" server.js
  echo "Atualizado o segredo da sessão no server.js para usar process.env.SECRET_KEY."
fi

# 4. Remove variáveis não usadas do .env real (opcional: só comenta)
sed -i '/^DB_HOST=/s/^/# /' .env
sed -i '/^DB_PORT=/s/^/# /' .env
sed -i '/^DB_NAME=/s/^/# /' .env
sed -i '/^DB_USER=/s/^/# /' .env
sed -i '/^DB_PASS=/s/^/# /' .env
sed -i '/^JWT_SECRET=/s/^/# /' .env
sed -i '/^JWT_EXPIRES_IN=/s/^/# /' .env
sed -i '/^API_KEY=/s/^/# /' .env
echo "Comentadas variáveis não utilizadas no .env real."

# 5. Commit e push
git add .gitignore .env.example server.js .env
git commit -m "Padronização global: variáveis de ambiente, .env.example e segurança"
git push origin main

echo "Tudo pronto! Projeto padronizado, seguro e atualizado no GitHub 🚀"
