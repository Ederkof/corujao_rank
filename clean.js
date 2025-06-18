const fs = require('fs');
const path = require('path');

function limparArquivosTemporarios() {
  console.log('\n🔎 Iniciando limpeza...');
  let removidos = 0;

  fs.readdirSync(__dirname).forEach(arquivo => {
    const caminho = path.join(__dirname, arquivo);
    const stats = fs.statSync(caminho);
    const isTemp = /\.(tmp|temp|log|bak)$/i.test(arquivo) || /^(temp-|test-|backup)/i.test(arquivo);

    if (isTemp && !stats.isDirectory()) {
      try {
        fs.unlinkSync(caminho);
        console.log(`🗑️ Removido: ${arquivo}`);
        removidos++;
      } catch (e) {
        console.log(`⚠️ Falha ao remover ${arquivo}: ${e.message}`);
      }
    }
  });

  console.log(removidos > 0 
    ? `\n✅ Limpeza concluída (${removidos} arquivos removidos)` 
    : `\n🔍 Nenhum arquivo temporário encontrado`);
}

// Adicione estas linhas para autoexecução quando chamado diretamente
if (require.main === module) {
  limparArquivosTemporarios();
} else {
  module.exports = limparArquivosTemporarios;
}
