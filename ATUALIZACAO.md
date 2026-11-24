# Atualização — bloqueio de mês fechado (CaronaPF)

O que mudou nesta versão, em relação à que está rodando hoje:

1. **Bloqueio de mês fechado:** na aba Calendário, o botão 🔒/🔓 no topo fecha ou reabre o mês em exibição. Um mês fechado trava toda marcação, troca ou remoção de carona nele — tanto na interface quanto no servidor (o Apps Script recusa a escrita mesmo que alguém tente contornar a tela). Configurações → "Fechamento mensal" lista todos os meses fechados e permite reabrir qualquer um deles, não só o que está em exibição no momento. Nomes, carros, datas de início e feriados continuam editáveis normalmente mesmo com meses fechados.
2. **Senha pra fechar/reabrir:** clicar no cadeado agora pede uma senha de administrador (`LOCK_PASSWORD` no `Code.gs`) antes de fechar ou reabrir qualquer mês. A senha é conferida no servidor, não só na tela — e de propósito não dá pra mudar `closedMonths` por nenhum outro caminho (nem editando configurações comuns), só por essa ação com a senha certa.
3. **Correção:** o app também passou a reagir de verdade quando o servidor recusa uma marcação (antes, mesmo uma recusa do servidor era tratada como sucesso na tela — o que, sem essa correção, teria dado pra "furar" o bloqueio de mês fechado só porque a interface não conferia a resposta).
4. **Correção menor:** a sincronização automática a cada 20s volta a pausar quando a aba está em segundo plano (uma versão anterior tinha perdido essa otimização, fazendo o app bater no Apps Script o tempo todo mesmo com a aba minimizada).

## Como aplicar

### 1. Backend (Apps Script)

1. Abra o `Code.gs` novo e troque a linha `var LOCK_PASSWORD = 'troque-essa-senha';` por uma senha sua. Essa é a senha que qualquer um vai precisar digitar pra fechar ou reabrir um mês — combine com quem for usar o app.
2. Abra sua planilha → **Extensões → Apps Script**.
3. Selecione todo o código atual (`Ctrl+A`) e apague.
4. Cole o conteúdo inteiro do `Code.gs` (já com a senha trocada).
5. Salve (`Ctrl+S`).
6. Vá em **Implantar → Gerenciar implantações** (⚠️ não é "Nova implantação" — isso criaria uma URL diferente da que já está em uso). Clique no ícone de lápis da implantação existente, escolha **Nova versão** em "Versão", e **Implantar**. Isso atualiza o mesmo link `/exec` que já está no `index.html` — ninguém precisa trocar de arquivo.
7. A primeira vez que qualquer pessoa abrir o app depois disso, a coluna `closedMonths` é criada sozinha na aba **Config** (igual aconteceu antes com as outras colunas) — não precisa mexer na planilha na mão.

> ⚠️ A senha fica em texto puro no script e trafega em texto puro na chamada — é uma trava "gente de boa não mexe sem combinar", não criptografia forte. Suficiente pra evitar que qualquer colega feche/reabra um mês sem querer ou sem saber que não devia, mas não é proteção contra alguém decidido a ler o tráfego de rede.

### 2. Front-end (index.html)

1. Abra o `index.html` novo e confira se a linha `var API_URL = "..."` já está com a mesma URL que você já usava (ela foi copiada do arquivo que você me mandou). Se por algum motivo a URL do passo anterior mudou, atualize aqui também.
2. Substitua o arquivo que seus colegas usam por este novo (mesmo nome, mesmo lugar).

### 3. Testar

1. Abra o app, vá no calendário do mês atual, clique no botão **🔒 Fechar mês** e digite a senha errada de propósito — nada deve acontecer além de um aviso de "senha incorreta".
2. Clique de novo e digite a senha certa — o mês deve fechar.
3. Tente clicar num dia desse mês — o dia deve aparecer com um cadeado pequeno, meio apagado, e não deve abrir a tela de marcar carona.
4. Vá em Configurações → Fechamento mensal, confira que o mês aparece na lista, e clique em **reabrir** (vai pedir a senha de novo) pra destravar.
5. Confirme que marcar carona num mês aberto continua funcionando normalmente, sem pedir senha nenhuma (a senha é só pra fechar/reabrir mês).

## Observação sobre troca de nome

A função "trocar nome" (quando você edita o nome de um colega em Configurações) ainda atualiza o nome em **todas** as viagens já registradas dessa pessoa, inclusive em meses fechados — isso não ficou bloqueado de propósito, porque é só a label mudando (é a mesma pessoa, só corrigindo o nome), não uma alteração de "quem dirigiu naquele dia". Se você preferir que isso também fique travado em meses fechados, me avisa que eu ajusto.
