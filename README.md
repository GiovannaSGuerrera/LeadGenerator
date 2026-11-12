# Radar de Clientes

Aplicação local para pesquisa comercial auditável em São Paulo.

## Executar

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. Para validação: `npm test` e `npm run build`.

O app aplica automaticamente as migrações SQLite. A modalidade de empresas mostra locais reais da Overture Maps com telefone informado, website não informado e coordenadas confirmadas dentro do município. Se a base Overture estiver vazia e houver uma exportação Foursquare válida com telefone, ela é usada. **Pedidos públicos** mostra projetos do RSS da Freelancer.com e, quando disponíveis, editais reais do PNCP em São Paulo para criação ou desenvolvimento de sites e software.

## Pedidos públicos (Freelancer.com e PNCP)

A fonte principal de pedidos publicados por clientes é o [RSS público da Freelancer.com](https://www.freelancer.com/rss.xml). O app consulta termos de site e software, filtra pedidos de desenvolvimento, guarda título, trecho da descrição, publicação, link e faixa de orçamento quando constarem no feed. A busca é global; os valores permanecem na moeda original. O RSS contém apenas itens recentes e não informa se cada projeto ainda aceita propostas. Confira a página original e siga as regras da plataforma para enviar uma proposta. O app não envia mensagens.

O painel abre com o filtro **Brasil ou EUR**: combina editais brasileiros e projetos com texto em português e sinal explícito de Brasil/BRL com projetos cujo orçamento publicado está em **EUR**. É possível selecionar cada recorte ou todas as moedas. O RSS não informa de modo confiável o país do cliente; por isso um projeto em português sem sinal brasileiro não é apresentado como brasileiro. O filtro EUR usa a moeda anunciada no projeto, sem conversão e sem garantia de que o pagamento final ocorrerá em euro. Um recorte pode ficar vazio entre atualizações; o app não completa a lista com dados fictícios.

Para atualizar agora e registrar a atualização horária no Windows:

```powershell
node .\scripts\import-freelancer-requests.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-freelancer-daily.ps1
```

O estado da atualização fica em `data/freelancer-requests-status.json`. A base recente é mantida por sete dias; um erro de rede preserva os registros já importados.

### Editais PNCP (complemento)

Para fazer a primeira consulta ou atualizar manualmente:

```powershell
node .\scripts\import-public-requests.mjs
```

Para agendar a busca diária às 07:15, com a mesma conta do Windows conectada:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-public-requests-daily.ps1
```

A busca consulta o [PNCP](https://pncp.gov.br/app/editais), fonte oficial e pública de editais, sem token. O recorte atual cobre pregão eletrônico e dispensa no município de São Paulo com encerramento previsto nos próximos sete dias. A aplicação filtra o objeto do edital por intenção de criação ou desenvolvimento de site, portal, sistema ou software, e retira os prazos encerrados. Cada resultado traz o órgão, município, data de encerramento, link do edital e valor estimado quando publicado. **Valor estimado total não é preço ofertado por você.** Confira o edital, anexos, exigências de habilitação e prazo no PNCP antes de enviar proposta. A consulta depende da disponibilidade e dos limites da API PNCP. O estado da última atualização fica em `data/public-requests-status.json`; uma falha preserva a lista anterior. Na primeira consulta completa em 03/11/2026, 742 editais foram verificados e nenhum pedido correspondente com prazo aberto foi encontrado no recorte. Uma tentativa anterior recebeu HTTP 429; o script usa ritmo mais lento e preserva os dados anteriores em falhas.

O botão **Ver empresa no Google Maps** pesquisa nome e endereço do estabelecimento no Maps. Quando o Google encontra a ficha correspondente, ela pode mostrar telefone, fotos e outras informações. Sem um Google Place ID validado, a busca pode mostrar mais de um resultado; confira nome e endereço antes de usar a ficha.

Copie `.env.example` para `.env.local` para configurar o caminho do SQLite. A conexão local está em `src/lib/db.ts`.

## Atualização gratuita sem token (Overture Maps)

A fonte principal é a [Overture Maps Places](https://docs.overturemaps.org/guides/places/), publicada em arquivos GeoParquet abertos. O script consulta o [catálogo STAC](https://stac.overturemaps.org/catalog.json), baixa o recorte de São Paulo com telefone e website não informado, cruza coordenadas com os 96 distritos oficiais e descarta categorias claramente não comerciais. Também exclui marcas identificadas e fichas cujo nome, telefone ou prefixo de marca aparece em outro registro local com website. Os IDs confirmados manualmente com site ficam em `config/known-website-ids.json` e não voltam em atualizações futuras. A base local é substituída somente após uma importação válida. Não é preciso criar conta nem pagar API.

A tarefa `RadarClientes-Overture-Diario` verifica a fonte todos os dias às **07:00**. A Overture publica novas versões aproximadamente uma vez por mês; nos demais dias, a tarefa verifica a versão sem baixar o mesmo arquivo novamente. Para atualizar manualmente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\refresh-overture.ps1 -Manual
```

Para registrar novamente a tarefa diária:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\register-overture-daily.ps1
```

O Windows precisa estar ligado, com a mesma conta conectada e acesso à internet. Se a máquina estiver indisponível às 07:00, o agendador tenta quando voltar. O painel recarrega os resultados a cada 15 minutos enquanto estiver aberto e também ao voltar para a aba. As categorias, telefones e ausência de website refletem a fonte, não uma verificação individual recente; o botão **Verificar site** abre uma busca por nome, endereço e telefone antes do contato. Nenhuma base consegue provar a inexistência de um site em toda a web. A [atribuição e as licenças das fontes Overture](https://docs.overturemaps.org/attribution/) estão vinculadas no rodapé do painel.

## Foursquare OS Places (opcional)

1. No [Foursquare Places Portal](https://docs.foursquare.com/data-products/docs/access-fsq-os-places), gere um **token novo** para o dataset FSQ OS Places. Se um token já apareceu em captura de tela, revogue-o no portal.
2. Abra o PowerShell na pasta do projeto e execute:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-daily.ps1
```

3. Cole o token **somente no prompt local**. O script testa o acesso ao catálogo antes de salvar a credencial; se ela for recusada, preserva a credencial anterior. Depois ele guarda o token criptografado pelo Windows DPAPI em `data/fsq-token.dpapi`, registra a tarefa `RadarClientes-Foursquare-Diario` às **07:00** e inicia a primeira atualização. Não compartilhe o token nesta conversa.

O botão Pesquisar consulta imediatamente o banco local.

Para executar manualmente outra atualização:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\refresh-fsq.ps1 -Manual
```

O script consulta o catálogo Iceberg autorizado, exporta **sem `LIMIT 1000`** um retângulo que contém todo o município, cruza cada coordenada com o [GeoJSON oficial dos 96 distritos](https://dadosabertos.urbis.prefeitura.sp.gov.br/dataset/distritos-municipais/resource/fdb28d08-b62d-424c-82fd-4191639fd23f), mantém apenas cadastros com `tel` preenchido e sem website informado e substitui a lista local somente depois de uma exportação válida. O painel mostra categorias comerciais prováveis, deixando fora tipos claramente não comerciais, como ruas e edifícios residenciais. Os limites distritais são da Prefeitura de São Paulo, licença CC BY-SA 4.0. Bairros informais menores não têm limites oficiais únicos; o filtro usa distritos oficiais e mostra os 96, inclusive os que estiverem com zero resultados.

Se a atualização Foursquare mostrar **HTTP 401**, o token salvo foi recusado pelo catálogo. Execute `setup-daily.ps1` novamente com o valor completo de um token de acesso ao **dataset OS Places** no Places Portal. Não use o identificador/nome do token nem uma chave da Places API. A exportação Foursquare antiga não contém o campo `tel`; isso não impede o uso da base Overture já carregada. Não compartilhe o token nesta conversa.

O arquivo exportado anteriormente com `LIMIT 1000` continha localidades rotuladas como São Paulo cujas coordenadas estavam em outros municípios. Por isso foi retirado da lista. Uma localidade textual, sozinha, não confirma que o negócio esteja na capital.

## Importação manual

Se desejar exportar manualmente pelo DuckDB do portal, use este recorte **sem limite**:

```sql
COPY (
  SELECT fsq_place_id, name, address, locality, region, country,
         latitude, longitude, website, tel, date_closed, date_refreshed,
         fsq_category_labels, unresolved_flags
  FROM places.datasets.places_os
  WHERE country = 'BR'
    AND latitude BETWEEN -24.05 AND -23.30
    AND longitude BETWEEN -46.90 AND -46.30
    AND (website IS NULL OR trim(website) = '')
    AND tel IS NOT NULL AND trim(tel) <> ''
    AND date_closed IS NULL
) TO 'sp-places.jsonl' (FORMAT JSON);
```

Copie o arquivo para o computador do app e execute:

```bash
npm run import:fsq -- C:\caminho\sp-places.jsonl
```

Atualize o painel. O importador aceita apenas registros com coordenadas dentro de um dos 96 distritos, nome, `website` vazio e telefone comercial informado no campo `tel` (8 a 15 dígitos); ignora registros fechados e flags críticas e elimina duplicações por `fsq_place_id`. O telefone vem da ficha pública do estabelecimento e pode estar desatualizado. A ausência de website na fonte não comprova que a empresa não tenha site ou queira contratar um.

## Não implementado

Não há scraping, busca em Google/Bing/redes sociais, acesso autenticado, envio de mensagens, enriquecimento, ranking sensível, bypass de controles ou geração de listas de spam. Overpass permanece desabilitado até aprovação operacional documentada.

Leia [a auditoria](docs/AUDIT.md) e [a arquitetura](docs/ARCHITECTURE.md) antes de habilitar qualquer fonte.
