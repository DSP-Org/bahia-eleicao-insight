# Plano

## Objetivo
Tornar a orientação dos PDFs de Relatórios inteligente: usar **A4 retrato** para resumos e tabelas enxutas, mantendo **A4 paisagem** apenas quando a quantidade e o tipo das colunas exigirem.

## Como ficará
- Abertura, destaques, avisos e cartões numéricos serão priorizados em retrato, aproveitando melhor a altura da página.
- Cada tabela será avaliada pela largura real necessária: quantidade de colunas, títulos, nomes de candidatos/municípios e campos numéricos.
- Tabelas que couberem com leitura confortável sairão em retrato; tabelas densas continuarão em paisagem.
- Relatórios mistos poderão alternar a orientação entre páginas: resumo em retrato e tabela larga em paisagem.
- O relatório especial de Bancadas continuará com sua apresentação própria, mas passará pela mesma avaliação para usar retrato quando o conteúdo couber.
- Cabeçalho, logo, rodapé, numeração, margens, quebra de texto e paginação serão recalculados para cada orientação.

## Critério inicial
- **Retrato:** blocos sem tabela e tabelas compactas, normalmente com até 5–6 colunas simples.
- **Paisagem:** tabelas comparativas, matrizes, muitas colunas, nomes longos ou número variável de candidatos.
- A decisão não dependerá apenas da contagem: será usada uma estimativa de largura por tipo de coluna, evitando texto espremido.

## Validação
- Conferir PDFs representativos de todos os grupos: Visão geral, Candidatos, Comparativo, Partidos e vagas e Municípios e regiões.
- Incluir casos estreitos, largos e mistos, além do novo **Painel de vários candidatos** com poucos e muitos candidatos.
- Verificar visualmente logo, cabeçalhos, rodapés, cortes de texto, continuidade das tabelas e numeração em páginas retrato e paisagem.
- Confirmar que CSV, filtros e cálculos permanecem inalterados.

## Detalhes técnicos
- Generalizar o gerador atual, que hoje usa dimensões fixas de A4 paisagem, para calcular largura, altura, área útil e rodapé por página.
- Introduzir uma classificação de orientação por bloco de tabela e abrir uma nova página ao trocar de orientação.
- Manter a exportação no navegador e os recursos já usados pelo PDF; nenhuma mudança nos dados eleitorais.
- Registrar a regra de orientação adaptativa na documentação técnica do projeto.
