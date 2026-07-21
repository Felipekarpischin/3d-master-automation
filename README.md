# 3D Master — painel local de pedidos

Primeira versão funcional do sistema da 3D Master. O painel cadastra clientes e pedidos, calcula custos de impressão e margem, acompanha a produção e gera uma mensagem pronta para WhatsApp. Tudo funciona localmente e sem API paga.

> Projeto de portfólio executado localmente. Ele não cria túnel, não abre porta pública e não envia o banco de clientes para serviços externos.

## Manual prático

O guia completo de operação está disponível em [Manual-Pratico-3D-Master.pdf](outputs/Manual-Pratico-3D-Master.pdf).

## O que já funciona

- Cadastro de pedidos e clientes
- Imagem de referência (PNG, JPG ou WebP)
- Cálculo de filamento, máquina, energia, custos extras e margem
- Pedido mínimo configurável
- Status: novo, orçamento enviado, aprovado, imprimindo, entregue e cancelado
- Mensagem pronta para copiar no WhatsApp
- Aprimoramento opcional da mensagem por um modelo no Ollama
- Webhook opcional para iniciar um fluxo no n8n
- Banco SQLite local e interface responsiva

## Iniciar

É necessário ter Node.js 22.13 ou mais recente.

No Windows, a forma mais simples é dar dois cliques em `INICIAR-3D-MASTER.cmd`. O iniciador abre o painel, o Ollama e o n8n. Mantenha a janela aberta durante o uso e pressione `Ctrl+C` para encerrar os serviços iniciados por ela.

Para iniciar somente o painel pelo terminal:

```powershell
npm start
```

Abra `http://127.0.0.1:3333` no navegador. O banco será criado automaticamente em `data/3d-master.sqlite` no primeiro uso.

Para desenvolvimento, com reinício automático:

```powershell
npm run dev
```

Para executar os testes:

```powershell
npm test
```

## Ollama (opcional)

O sistema sempre gera uma mensagem padrão, mesmo sem IA. Para habilitar a melhoria de texto:

1. Instale e inicie o Ollama.
2. Baixe o modelo recomendado para este computador: `ollama pull qwen3.5:4b`.
3. No painel, abra **Configurações** e confirme o endereço e o nome do modelo.
4. Em um pedido, use **Melhorar com Ollama**.

## n8n (opcional)

O fluxo **3D Master - Novo pedido** está salvo em `n8n/workflows/3d-master-novo-pedido.json`. Seu webhook local é `http://127.0.0.1:5678/webhook/3d-master-pedido`. Cada pedido é registrado no histórico de execuções do n8n. Se o n8n estiver desligado, o cadastro do pedido continua funcionando normalmente.

## Backup

Com o sistema fechado, copie a pasta `data`. Ela contém o banco e as imagens de referência. Não publique essa pasta no GitHub; ela está ignorada pelo Git.

## Segurança e privacidade

- O painel, o n8n e o Ollama usam endereços `127.0.0.1`, acessíveis somente no próprio computador.
- O iniciador não executa Cloudflare Tunnel, encaminhamento de porta ou publicação na internet.
- Banco SQLite, imagens, dados do n8n, arquivos `.env`, chaves e temporários são bloqueados pelo `.gitignore`.
- O workflow versionado do n8n não contém credenciais e é publicado inativo.
- Para disponibilizar o sistema externamente, implemente autenticação, HTTPS e uma revisão de segurança antes de alterar o endereço de escuta.

Consulte também a [política de segurança](SECURITY.md).

## Próximas evoluções sugeridas

- Exportação do orçamento em PDF
- Cálculo por perfil de impressora e tipo de filamento
- Histórico de alterações por pedido
- Etiqueta e ficha de produção para impressão
- Autenticação, caso o painel passe a ser acessado por outras pessoas
