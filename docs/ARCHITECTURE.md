# Arquitetura e decisões técnicas

## Visão geral

O 3D Master Automation é um monólito local-first. A interface, a API e o banco são executados no mesmo computador para reduzir custo e complexidade operacional na primeira versão.

## Componentes

| Componente | Responsabilidade | Dependência obrigatória |
|---|---|---|
| Interface web | Cadastro, consulta, cálculo prévio e acompanhamento | Sim |
| API Node.js | Validação, regras de negócio e integrações | Sim |
| SQLite | Clientes, pedidos, mensagens e configurações | Sim |
| Ollama | Aprimoramento opcional do texto comercial | Não |
| n8n | Registro e expansão opcional da automação | Não |

## Fluxo de um pedido

1. O operador envia os dados pela interface local.
2. A API valida os campos obrigatórios e calcula o orçamento.
3. O cliente é localizado ou criado no SQLite.
4. O pedido e a mensagem de fallback são persistidos.
5. O webhook do n8n é acionado sem bloquear a operação.
6. Sob demanda, o Ollama reescreve a mensagem sem alterar preço ou prazo.
7. O operador copia o texto e realiza o envio manual pelo WhatsApp.

## Princípios adotados

### Local-first

Dados comerciais permanecem no computador. O servidor usa `127.0.0.1`, impedindo conexões diretas de outras máquinas pela interface de rede.

### Degradação controlada

Ollama e n8n são opcionais. Falhas nessas integrações não impedem o cadastro do pedido, o cálculo ou a geração da mensagem padrão.

### Cálculo determinístico

A IA não define preço. Custos e margem são calculados por regras testáveis; o modelo local atua somente na redação da mensagem.

### Dados fora do repositório

Banco SQLite, uploads, configurações locais do n8n, backups e ambientes são ignorados pelo Git. O workflow publicado não contém credenciais.

## Limites de segurança

Esta versão não foi projetada para exposição direta à internet. Não há autenticação porque o acesso é restrito ao computador local. Uma futura versão em rede deve adicionar, antes da exposição:

- autenticação e autorização;
- HTTPS e gerenciamento seguro de segredos;
- proteção contra CSRF e limitação de requisições;
- política de sessão, auditoria e backups automatizados;
- revisão de upload e isolamento dos arquivos;
- monitoramento e atualização contínua das dependências.

## Persistência e backup

O diretório `data/` concentra o banco e as imagens de referência. O backup deve ser realizado com o sistema fechado, copiando o diretório inteiro para um local seguro. Esse conteúdo nunca deve ser enviado ao GitHub.
