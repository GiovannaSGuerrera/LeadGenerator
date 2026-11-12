# Auditoria de fontes — Radar de Clientes

Data da primeira avaliação: 02/11/2026. Escopo: cidade de São Paulo, pesquisa local, sem contato automático.

## OpenStreetMap / Overpass

- URL: https://www.openstreetmap.org/ e https://overpass-api.de/api/interpreter
- Dados: nomes, categorias/tags, endereços e website quando mapeados; cobertura depende do mapeamento voluntário e pode ser incompleta em São Paulo.
- Acesso: somente leitura via Overpass; User-Agent identificável; consultas pequenas e sequenciais, com cache local e rate limit. Não usar a API de edição para leitura.
- Chave/cadastro/custo: não exige chave no endpoint público; sem SLA. Custo direto zero, custo operacional de cache/infra próprio.
- Limites: a política publicada recomenda, para uso recorrente em app, ficar abaixo de 100 consultas/dia e 10 MB/dia no endpoint principal; sem paralelismo; pausar 30s em 429/406. O endpoint pode ficar indisponível.
- Termos/restrições: respeitar políticas do endpoint, OSMF Terms of Use, não enviar dados pessoais/confidenciais e não automatizar formulários.
- Licença/atribuição: dados ODbL 1.0; exibir `© OpenStreetMap contributors` e informar licença/fonte. Armazenamento de dados derivados exige revisar obrigações de share-alike/atribuição.
- Armazenamento local: possível, sujeito à ODbL e registro de data/fonte; cache somente após configuração de retenção e política de atualização.
- Dados pessoais: podem existir nomes/telefones livres em tags; a aplicação deve minimizar e não importar contatos pessoais.
- Falsos positivos: alto risco de website desatualizado, não mapeado ou cadastrado em outra fonte; ausência não é prova de inexistência.
- Decisão: **CONDICIONADA**. Aprovável somente com endpoint próprio/pago ou autorização operacional documentada, User-Agent, cache, quotas, monitoramento e revisão da licença para armazenamento.
- Alternativa segura: exemplos locais durante o desenvolvimento; depois extrato OSM licenciado processado localmente ou provedor Overpass contratado.

## Pedidos públicos de criação de sites

- Freelancer.com: https://www.freelancer.com/rss.xml publica um RSS próprio com projetos recentes, título, resumo, data, link e faixa de orçamento quando informada. Acesso público sem token; consulta horária de termos de site e software, sem scraping de páginas de projeto. O feed é global e pode omitir ou resumir detalhes; status de aceitação de propostas deve ser conferido na página original. Dados armazenados localmente por sete dias, sem contato automático. **Habilitada**.
- PNCP: https://pncp.gov.br/api/consulta/swagger-ui/index.html documenta consulta pública de contratações com propostas abertas. O app consulta pregão eletrônico e dispensa no município de São Paulo nos próximos sete dias, mantém apenas objetos relacionados a criação de site ou software e usa o link oficial do edital. A API aplica limites de requisições; uma tentativa em 03/11/2026 recebeu HTTP 429. Com recorte menor, a consulta completa de 742 editais teve zero correspondências de site/software com prazo aberto. A tarefa diária repete a consulta e preserva a base anterior em caso de falha. **Habilitada**.
- Google/Bing, redes sociais e outros marketplaces não fazem parte da coleta automática. Não há varredura transversal de toda a internet. As regras de participação e contato de cada fonte devem ser seguidas na publicação original.

## Foursquare OS Places — importação local

- URL: https://docs.foursquare.com/data-products/docs/access-fsq-os-places ; esquema: https://docs.foursquare.com/data-products/docs/places-os-data-schema
- Dados: POI, nome, endereço, coordenadas, localidade, categoria, website, telefone comercial (`tel`), datas e flags. Cobertura de São Paulo variável, sem garantia de completude; bairro não é campo garantido. A classificação territorial usa os 96 distritos oficiais da Prefeitura.
- Acesso permitido: exportação pelo Places Portal e seu catálogo Iceberg, com conta e token pessoal mantido localmente. Não utiliza a Places API paga.
- Chave/custo: token do portal obrigatório para acessar o catálogo atual; dataset OS anunciado como gratuito. Custos de processamento e armazenamento locais ficam a cargo do usuário.
- Limites: quotas específicas do portal não foram publicadas na documentação consultada; respeitar limites da conta e consultar somente o recorte necessário.
- Termos/licença: dataset OS publicado sob Apache 2.0, com aviso de copyright Foursquare Labs, Inc.; preservar a atribuição. Verificar os termos apresentados no portal ao criar a conta.
- Armazenamento local: permitido pela licença publicada para o dataset OS, sujeito aos termos específicos da conta; importar apenas campos mínimos.
- Dados pessoais: nomes empresariais podem coincidir com nomes pessoais; importar apenas o telefone público do estabelecimento quando informado na fonte, sem e-mail, redes sociais ou contatos pessoais enriquecidos.
- Falsos positivos: campo website vazio não prova ausência de site; POIs podem estar desatualizados, duplicados ou não comerciais. Filtrar `date_closed` e flags críticas; confirmar manualmente.
- Decisão: **APROVADA para importação local da exportação OS licenciada**. O acesso ao dataset depende do cadastro e da leitura dos termos do portal pelo usuário. A tarefa diária acessa o catálogo com token guardado no DPAPI do Windows e substitui a base somente após exportação válida.
- Alternativa: Overture Maps Places, descrita abaixo.

## Overture Maps Places — fonte principal gratuita

- URL e esquema: https://docs.overturemaps.org/guides/places/ ; acesso com DuckDB: https://docs.overturemaps.org/getting-data/duckdb/ ; atribuição: https://docs.overturemaps.org/attribution/
- Dados: nome, categoria, endereço, coordenadas, `phones`, `websites`, pontuação relativa de confiança e ID GERS. Não há confirmação individual recente de que o telefone funcione ou de que o negócio não tenha site.
- Acesso e custo: leitura pública de GeoParquet no S3 da Overture, sem conta ou chave. Custos locais de internet e armazenamento ficam a cargo do usuário.
- Atualização: a fonte publica versões aproximadamente mensais; a tarefa local verifica o catálogo STAC diariamente e importa quando a versão muda.
- Licenças: o tema Places combina fontes sob CDLA Permissive 2.0, Foursquare sob Apache 2.0 e AllThePlaces sob CC0. O painel vincula a página oficial de atribuição e licenças.
- Qualidade: usar `confidence >= 0.8`, `phones` preenchido, `websites` vazio, country BR, coordenadas dentro dos distritos de São Paulo, excluir locais encerrados quando identificados e categorias claramente não comerciais. Cruzar nome, telefone e prefixo de marca com fichas que informam site; excluir marcas identificadas e IDs cujo site foi confirmado manualmente. A pontuação é relativa e não confirma existência, ausência de site ou intenção de compra.
- Decisão: **APROVADA para importação local de estabelecimentos públicos**, com revisão manual antes de qualquer contato. Não há scraping ou contato automatizado.

## Gates

Gates A–H permanecem ativos. As importações locais Overture e Foursquare estão habilitadas; não há scraping, dados privados, inferência de intenção, contato automático, enriquecimento ou ranking sensível.

Fontes consultadas: [política de API OSM](https://operations.osmfoundation.org/policies/api/), [política de tiles OSM](https://operations.osmfoundation.org/policies/tiles/), [documentação de Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API), [licença ODbL](https://osmfoundation.org/wiki/Licence_and_Legal_FAQ).
