export type Locale = {
  crowdin: boolean
  languageCode: string /* ISO 639-1 */
  languageName: string
  role: string
  channel: string
  messages: {
    discord_linking: string
    internationalization: string
    no_results: string
  }
}

export const LOCALES: Locale[] = [
  {
    crowdin: true,
    languageCode: 'de',
    languageName: 'Deutsch',
    role: 'de | Deutsch',
    channel: 'de-deutsch',
    messages: {
      discord_linking:
        'Offenbar versuchst du, dein Spielkonto mit deinem Discord-Konto zu verknüpfen. Allerdings hast du anscheinend deine Spiel-ID anstelle des Verknüpfungsbefehls eingefügt. Bitte befolge die Anweisungen in %s sorgfältig.',
      internationalization:
        'Unser Discord-Server ist ausschließlich englischsprachig (Regel 3.1). Bitte bleiben Sie bei Englisch oder treten Sie %s bei, um Deutsch zu sprechen.',
      no_results:
        'Leider konnten wir zu Ihrer Frage keinen relevanten Inhalt finden. Versuchen Sie es mit einer anderen Formulierung oder stellen Sie eine andere Frage.',
    },
  },
  {
    crowdin: false,
    languageCode: 'en',
    languageName: 'English',
    role: 'en | English',
    channel: 'en-english',
    messages: {
      discord_linking:
        'It looks like you’re attempting to link your game account to your Discord account. However, you appear to have pasted your game ID instead of the linking command. Please, carefully follow the instructions in %s.',
      internationalization:
        'Our Discord server is English-speaking only (rule 3.1). Kindly stick to using English or consider joining our international channels.',
      no_results:
        'Unfortunately, no relevant content was found for your question. Please try rephrasing it or ask a different question.',
    },
  },
  {
    crowdin: true,
    languageCode: 'es',
    languageName: 'Español',
    role: 'es | Español',
    channel: 'es-español',
    messages: {
      discord_linking:
        'Parece que intentas vincular tu cuenta de juego con tu cuenta de Discord. Sin embargo, parece que has pegado tu ID de juego en lugar del comando de vinculación. Sigue atentamente las instrucciones de %s.',
      internationalization:
        'Nuestro servidor de Discord es exclusivamente angloparlante (regla 3.1). Por favor, habla solo inglés o considera unirte a %s para hablar en español.',
      no_results:
        'Lamentablemente, no se encontró contenido relevante para tu pregunta. Intenta reformularla o haz otra pregunta.',
    },
  },
  {
    crowdin: true,
    languageCode: 'fr',
    languageName: 'Français',
    role: 'fr | Français',
    channel: 'fr-français',
    messages: {
      discord_linking:
        'Il semblerait que vous souhaitiez lier votre compte de jeu à votre compte Discord. Cependant, vous avez collé votre identifiant de jeu au lieu de la commande de liaison. Veuillez suivre attentivement les instructions dans %s.',
      internationalization:
        'Notre serveur Discord est exclusivement anglophone (règle 3.1). Veuillez utiliser l’anglais ou joignez %s pour parler français.',
      no_results:
        'Malheureusement, aucun contenu pertinent n’a été trouvé pour ta question. Reformule ta question ou poses-en une autre.',
    },
  },
  {
    crowdin: true,
    languageCode: 'it',
    languageName: 'Italiano',
    role: 'it | Italiano',
    channel: 'it-italiano',
    messages: {
      discord_linking:
        'Sembra che tu stia tentando di collegare il tuo account di gioco al tuo account Discord. Tuttavia, sembra che tu abbia incollato il tuo ID di gioco invece del comando di collegamento. Segui attentamente le istruzioni in %s.',
      internationalization:
        'Il nostro server Discord è in lingua inglese (regola 3.1). Si prega di utilizzare l’inglese o di unirsi a %s per parlare in italiano.',
      no_results:
        'Purtroppo non è stato trovato alcun contenuto pertinente alla tua domanda. Prova a riformularla o a porre una domanda diversa.',
    },
  },
  {
    crowdin: true,
    languageCode: 'ja',
    languageName: '日本語',
    role: 'jp | 日本語',
    channel: 'jp-日本語',
    messages: {
      discord_linking:
        'ゲームアカウントをDiscordアカウントにリンクしようとしているようです。しかし、リンクコマンドではなくゲームIDを貼り付けたようです。%sの指示に従ってください。',
      internationalization:
        'Discordサーバーは英語のみでご利用いただけます（ルール3.1）。英語で会話いただくか、%sに参加して日本語で会話されることをご検討ください。',
      no_results:
        '申し訳ございませんが、ご質問に該当するコンテンツは見つかりませんでした。別の質問をお試しいただくか、別の質問を投稿してください。',
    },
  },
  {
    crowdin: true,
    languageCode: 'kr',
    languageName: '한국어',
    role: 'kr | 한국어',
    channel: 'kr-한국어',
    messages: {
      discord_linking:
        '게임 계정을 Discord 계정에 연결하려고 하시는 것 같습니다. 하지만 연결 명령어 대신 게임 ID를 붙여넣으신 것 같습니다. %s의 지침을 주의 깊게 따르세요.',
      internationalization:
        '저희 디스코드 서버는 영어로만 소통합니다(규칙 3.1). 영어를 사용하시거나 %s 님과 함께 한국어로 소통해 보세요.',
      no_results:
        '죄송하지만, 질문과 관련된 내용을 찾을 수 없습니다. 질문을 다시 작성하거나 다른 질문을 올려주세요.',
    },
  },
  {
    crowdin: false,
    languageCode: 'tl',
    languageName: 'Filipino',
    role: 'ph | Filipino',
    channel: 'ph-filipino',
    messages: {
      discord_linking:
        'Mukhang sinusubukan mong i-link ang iyong game account sa iyong Discord account. Gayunpaman, lumilitaw na nai-paste mo ang iyong ID ng laro sa halip na ang command sa pag-link. Mangyaring, maingat na sundin ang mga tagubilin sa %s.',
      internationalization:
        'Ang aming Discord server ay nagsasalita lamang ng Ingles (panuntunan 3.1). Mangyaring manatili sa paggamit ng Ingles o isaalang-alang ang pagsali sa %s upang magsalita sa Filipino.',
      no_results:
        'Sa kasamaang palad, walang nakitang nauugnay na nilalaman para sa iyong tanong. Pakisubukang i-rephrase ito o magtanong ng ibang tanong.',
    },
  },
  {
    crowdin: true,
    languageCode: 'pl',
    languageName: 'Polski',
    role: 'pol | Polski',
    channel: 'pl-polski',
    messages: {
      discord_linking:
        'Wygląda na to, że próbujesz połączyć swoje konto gry z kontem Discord. Jednak wygląda na to, że wkleiłeś swój identyfikator gry zamiast polecenia łączenia. Postępuj dokładnie według instrukcji w %s.',
      internationalization:
        'Nasz serwer Discord jest tylko anglojęzyczny (zasada 3.1). Prosimy trzymać się języka angielskiego lub rozważyć dołączenie do %s, aby rozmawiać po polsku.',
      no_results:
        'Niestety, nie znaleziono żadnej treści odpowiadającej Twojemu pytaniu. Spróbuj je sformułować inaczej lub zadaj inne pytanie.',
    },
  },
  {
    crowdin: true,
    languageCode: 'pt',
    languageName: 'Português',
    role: 'pt-br | Português',
    channel: 'pt-br-português',
    messages: {
      discord_linking:
        'Parece que você está tentando vincular sua conta de jogo à sua conta do Discord. No entanto, você aparentemente colou o ID do jogo em vez do comando de vinculação. Siga atentamente as instruções em %s.',
      internationalization:
        'Nosso servidor do Discord é somente em inglês (regra 3.1). Por favor, continue usando o inglês ou considere se juntar ao %s para falar em português.',
      no_results:
        'Infelizmente, não encontramos conteúdo relevante para sua pergunta. Tente reformular a pergunta ou faça uma pergunta diferente.',
    },
  },
  {
    crowdin: true,
    languageCode: 'ru',
    languageName: 'Русский',
    role: 'ru | Русский',
    channel: 'ru-русский',
    messages: {
      discord_linking:
        'Похоже, вы пытаетесь связать свою игровую учетную запись с учетной записью Discord. Однако, похоже, вы вставили свой игровой идентификатор вместо команды связывания. Пожалуйста, внимательно следуйте инструкциям в %s.',
      internationalization:
        'Наш сервер Discord только на английском языке (правило 3.1). Пожалуйста, придерживайтесь английского языка или рассмотрите возможность присоединиться к %s, чтобы говорить на русском.',
      no_results:
        'К сожалению, для вашего вопроса не найдено подходящего контента. Попробуйте перефразировать его или задать другой вопрос.',
    },
  },
  {
    crowdin: true,
    languageCode: 'th',
    languageName: 'ภาษาไทย',
    role: 'th | ภาษาไทย',
    channel: 'th-ภาษาไทย',
    messages: {
      discord_linking:
        'ดูเหมือนว่าคุณกำลังพยายามเชื่อมโยงบัญชีเกมของคุณกับบัญชี Discord แต่ดูเหมือนว่าคุณได้วาง ID เกมของคุณแทนคำสั่งเชื่อมโยง โปรดปฏิบัติตามคำแนะนำใน %s อย่างระมัดระวัง',
      internationalization:
        'เซิร์ฟเวอร์ Discord ของเรารองรับเฉพาะภาษาอังกฤษเท่านั้น (กฎ 3.1) โปรดใช้ภาษาอังกฤษหรือพิจารณาเข้าร่วม %s เพื่อพูดภาษาไทย',
      no_results:
        'ขออภัย ไม่พบเนื้อหาที่เกี่ยวข้องกับคำถามของคุณ โปรดลองเขียนคำถามใหม่หรือถามคำถามอื่น',
    },
  },
  {
    crowdin: true,
    languageCode: 'tr',
    languageName: 'Türkçe',
    role: 'tr | Türkçe',
    channel: 'tr-türkçe',
    messages: {
      discord_linking:
        'Oyun hesabınızı Discord hesabınıza bağlamaya çalışıyor gibi görünüyorsunuz. Ancak, bağlantı komutu yerine oyun kimliğinizi yapıştırmış gibi görünüyorsunuz. Lütfen %s içindeki talimatları dikkatlice izleyin.',
      internationalization:
        'Discord sunucumuz sadece İngilizce konuşulmaktadır (kural 3.1). Lütfen İngilizce kullanmaya devam edin veya Türkçe konuşmak için %s’e katılmayı düşünün.',
      no_results:
        'Maalesef sorunuzla ilgili alakalı içerik bulunamadı. Lütfen yeniden ifade etmeyi deneyin veya farklı bir soru sorun.',
    },
  },
  {
    crowdin: true,
    languageCode: 'vi',
    languageName: 'Tiếng Việt',
    role: 'vn | Tiếng Việt',
    channel: 'vn-tiếng-việt',
    messages: {
      discord_linking:
        'Có vẻ như bạn đang cố gắng liên kết tài khoản trò chơi của mình với tài khoản Discord. Tuy nhiên, có vẻ như bạn đã dán ID trò chơi của mình thay vì lệnh liên kết. Vui lòng làm theo hướng dẫn cẩn thận trong %s.',
      internationalization:
        'Máy chủ Discord của chúng tôi chỉ sử dụng tiếng Anh (quy tắc 3.1). Vui lòng sử dụng tiếng Anh hoặc cân nhắc tham gia %s để nói tiếng Việt.',
      no_results:
        'Thật không may, không tìm thấy nội dung có liên quan cho câu hỏi của bạn. Vui lòng thử diễn đạt lại hoặc hỏi một câu hỏi khác.',
    },
  },
  {
    crowdin: true,
    languageCode: 'zh',
    languageName: '汉语',
    role: 'zh | 汉语',
    channel: 'zh-汉语',
    messages: {
      discord_linking:
        '您似乎正在尝试将您的游戏帐户关联到您的 Discord 帐户。但是，您粘贴的似乎是您的游戏 ID，而不是关联命令。请仔细按照 %s 中的说明操作。',
      internationalization:
        '我们的 Discord 服务器仅支持英语（规则 3.1）。请坚持使用英语，或考虑加入 %s 使用中文交流。',
      no_results:
        '很遗憾，我们未找到与您的问题相关的内容。请尝试重新表述或提出其他问题。',
    },
  },
]

export const MIN_LENGTH_LANGUAGE_DETECTION_THRESHOLD = 40
