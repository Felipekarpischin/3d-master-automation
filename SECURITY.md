# Segurança do projeto

## Escopo atual

Esta versão foi criada para uso local. O servidor do painel escuta somente em `127.0.0.1:3333`, e o iniciador configura o n8n em `127.0.0.1:5678`. O projeto não inicia túnel público, não configura o roteador e não abre portas no Firewall do Windows.

## Dados que nunca devem ser publicados

- pasta `data/`, incluindo bancos SQLite e imagens de clientes;
- pasta de usuário do n8n e suas credenciais;
- arquivos `.env`, tokens, senhas, chaves privadas e certificados;
- backups e arquivos temporários.

Esses itens estão cobertos pelo `.gitignore`. Antes de qualquer publicação, confirme com `git status` que eles não aparecem na lista de arquivos preparados.

## Uso pela internet

Não altere o endereço de escuta para `0.0.0.0` e não crie túnel para esta versão. Antes de permitir acesso por outras máquinas, são necessários autenticação, autorização, HTTPS, proteção contra requisições indevidas, limites de acesso e uma nova auditoria de segurança.

## Relato responsável

Se encontrar uma falha, não publique dados reais em uma issue. Descreva apenas como reproduzir o problema usando informações fictícias.
