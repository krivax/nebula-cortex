# Aparência do Nebula

Implementado em 03/10/2026 no desktop principal Electron.

Abra a engrenagem da barra superior e use **Configurações de IA → Aparência → Tema do Nebula**:

- **Padrão do sistema (automático):** configuração inicial, acompanha a aparência do computador.
- **Claro:** permanece claro mesmo quando o computador usa aparência escura.
- **Escuro:** permanece escuro mesmo quando o computador usa aparência clara.

A seleção é aplicada e salva automaticamente, independentemente do botão que salva os modelos de IA. Fechar as configurações não desfaz a escolha. Ao reabrir o aplicativo, a preferência é restaurada.

## Superfícies

Assistente, barra superior, navegação, conversa, campos, cartões, artefatos, menu de agentes e diálogos usam uma paleta compartilhada com duas variantes. Foi removida a imposição de modo claro na inicialização.

O tema nativo do Electron acompanha a seleção. O Navegador Nebula transmite essa preferência às páginas que respeitam `prefers-color-scheme`; não reescreve o estilo dos sites.

A extensão própria do Editor Nebula acompanha a aparência compartilhada e escolhe o tema claro/escuro preferido do editor. A troca funciona com o editor já carregado e preserva as abas. Configurações específicas de tema dentro de um workspace podem prevalecer, conforme as regras do editor.

## Persistência e sincronização

A preferência fica no armazenamento local do desktop, com padrão `system`. Apenas o renderer principal pode consultá-la e alterá-la via IPC; valores fora de `system`, `light` e `dark` são rejeitados. A aparência efetiva é publicada por substituição atômica em `appearance.json` no perfil do aplicativo. A extensão do editor observa esse arquivo, que contém somente o esquema e o modo de cor.

## Verificação

- Checagem de tipos e 20 testes existentes passaram.
- Integração nativa com perfil sintético verificou padrão automático, persistência de claro/escuro, aparência nativa, arquivo compartilhado e rejeição de valor inválido.
- O aplicativo empacotado foi verificado pela interface: seletor inicialmente automático, claro/escuro no assistente e configurações, ambos os temas no editor aberto e restauração de Claro após fechar/reabrir o perfil de teste.
- A seleção automática foi restaurada no perfil de teste ao concluir. O perfil pessoal foi reaberto no aplicativo atualizado.

Capturas: [configurações claras](nebula-theme-light.png), [configurações escuras](nebula-theme-dark.png), [editor claro](nebula-editor-light.png) e [editor escuro](nebula-editor-dark.png).
