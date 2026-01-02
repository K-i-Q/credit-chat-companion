const templates = [
  (topic: string) => `Excelente pergunta sobre "${topic}"! Aqui está minha orientação:

**Passo 1:** Comece identificando os pontos principais do que você deseja alcançar.

**Passo 2:** Divida o problema em partes menores e mais gerenciáveis.

**Passo 3:** Execute cada parte de forma sistemática, validando os resultados.

Lembre-se: a prática leva à excelência! 🚀`,

  (topic: string) => `Entendi que você quer saber mais sobre "${topic}". Vamos lá:

**Passo 1:** Primeiro, é importante entender o contexto completo da situação.

**Passo 2:** Pesquise referências e exemplos similares para inspiração.

**Passo 3:** Aplique o conhecimento de forma gradual, testando cada etapa.

Você está no caminho certo! 💡`,

  (topic: string) => `Ótimo tema: "${topic}"! Minha sugestão:

**Passo 1:** Defina claramente seus objetivos e métricas de sucesso.

**Passo 2:** Crie um plano de ação com prazos realistas.

**Passo 3:** Monitore seu progresso e ajuste conforme necessário.

Consistência é a chave! 🎯`,

  (topic: string) => `Sobre "${topic}", aqui vai meu conselho:

**Passo 1:** Faça uma análise inicial do que você já sabe sobre o assunto.

**Passo 2:** Identifique as lacunas de conhecimento que precisam ser preenchidas.

**Passo 3:** Busque recursos de qualidade e pratique regularmente.

Nunca pare de aprender! 📚`,

  (topic: string) => `Interessante você perguntar sobre "${topic}"! Veja:

**Passo 1:** Reflita sobre o porquê desse tema ser importante para você.

**Passo 2:** Estabeleça metas claras e mensuráveis.

**Passo 3:** Comemore pequenas vitórias ao longo do caminho.

O progresso vem de passos consistentes! ✨`,
];

export const generateMockAnswer = (userMessage: string): string => {
  const topic = userMessage.length > 50 
    ? userMessage.substring(0, 50) + '...' 
    : userMessage;
  
  const randomIndex = Math.floor(Math.random() * templates.length);
  return templates[randomIndex](topic);
};
