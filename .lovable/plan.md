# Painel Eleições 2026 — Bahia

Site público para ver os resultados oficiais do TSE com foco na Bahia: Presidente, Governador, Senador, Deputado Federal e Deputado Estadual.

## Páginas

1. **Início (/)** — visão geral: quantas urnas foram apuradas, quem lidera em cada cargo, comparecimento e abstenção, votos brancos e nulos, horário da última atualização.
2. **Mapa (/mapa)** — mapa da Bahia com os 417 municípios. Escolha o cargo e veja cada município pintado pela cor de quem venceu ali, ou pela força de um candidato escolhido (mapa de calor). Ao clicar num município, aparece um painel com o resultado de lá.
3. **Cargo (/cargo/$cargo)** — ranking completo, gráfico de barras, eleitos ou em 2º turno, votos por partido. Para deputados: vagas por partido e federação, e lista de eleitos e suplentes.
4. **Candidato (/candidato/$id)** — votos totais, percentual, os 20 municípios onde foi melhor e pior, mapa só dele e divisão por território de identidade.
5. **Comparar (/comparar)** — escolha de 2 a 4 candidatos do mesmo cargo: lado a lado, mapa de quem venceu cada um, municípios onde cada um ganha e diferença de votos.
6. **Município (/municipio/$codigo)** — todos os cargos naquela cidade, comparecimento, comparação com a média da Bahia.
7. **Relatórios (/relatorios)** — tabelas com filtro e exportação em CSV: resultado por município, por território, por partido, regiões de maior abstenção, ranking dos votos mais concentrados ou espalhados.

## Visual
Estilo de jornal de dados: fundo claro tipo papel, títulos com fonte serifada forte, números com fonte mono, cores próprias dos partidos nos gráficos. Funciona bem no celular.

## Detalhes técnicos
- Os dados vêm dos arquivos públicos de resultado do TSE (`resultados.tse.jus.br`, eleição de 2026, UF BA). Funções no servidor buscam os dados e guardam em cache por alguns minutos; a página atualiza sozinha durante a apuração.
- Lovable Cloud para guardar cópias dos resultados por município e a lista de candidatos, para que relatórios e comparações fiquem rápidos e o site funcione mesmo se o TSE estiver lento. Leitura pública, só o servidor grava.
- Formas dos municípios da Bahia em GeoJSON (malha do IBGE) e tabela que liga o código do TSE ao código do IBGE e ao território de identidade.
- Mapa com Leaflet carregado só no navegador; gráficos com Recharts.
- Antes de implementar, confirmar os endereços exatos dos arquivos de 2026 do TSE; se o formato mudar, ajustar o leitor dos dados. Enquanto não houver dados, mostrar aviso claro em vez de números inventados.
