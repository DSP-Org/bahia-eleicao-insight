# Plano

## Objetivo
Revisar a página **Indicadores** para que cada aba mostre apenas controles que realmente mudam os cartões daquela visualização.

## Ajustes previstos
- Avaliar as abas **Todos**, **Participação**, **Votos**, **Disputa**, **Municípios** e **Candidato**.
- Manter **Cargo** onde ele altera os indicadores exibidos.
- Mostrar **Recorte** apenas nas abas em que os números são recalculados por região/território/município.
- Mostrar **Candidato do raio-x** apenas quando a aba de candidato estiver sendo vista ou buscada.
- Manter a busca de indicador apenas quando houver vários cartões úteis para procurar.
- Ajustar os textos de apoio para deixar claro quando um número é do recorte ou da Bahia inteira.
- Validar no celular para evitar estouro lateral.

## Detalhes técnicos
- A lógica ficará concentrada em `src/routes/indicadores.tsx` e, se necessário, em `src/lib/indicadores.ts`.
- Os cálculos continuam vindo dos snapshots estáticos já existentes.
- Não haverá mudança nos dados, login ou armazenamento.
