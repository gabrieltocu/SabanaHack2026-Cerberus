"""Lo que Cerberus le dice al visitante, en espanol, ingles, mandarin y portugues (un solo lugar para traducir).

t(lang, clave, **datos) -> texto. Si falta una traduccion se usa el espanol. Los espacios del club (banos, restaurante)
son SUPUESTOS declarados del club simulado, como el resto de la orientacion.
"""
IDIOMAS = ('es', 'en', 'zh', 'pt')

T = {
    'es': {
        'voz.llamado': '¿Sí? Dígame.', 'cumple': '¡Y feliz cumpleaños, {nombre}! Todo N Club le desea un día maravilloso.', 'voz.repetir': 'Disculpe, no le escuché bien. ¿Me lo repite, por favor?', 'voz.quien': 'Me llamo Juan, el robot de recepción de N Club. Un gusto atenderle.', 'voz.despedida': 'Gracias por su visita. Hasta pronto.',
        'salida.VIP': 'Hasta pronto, {trato}. Gracias por su visita; le esperamos de vuelta.',
        'salida.REGULAR': 'Hasta pronto, {nombre}. Gracias por su visita; le esperamos de vuelta.',
        'salida.INVITADO': 'Hasta pronto, {nombre}. Gracias por visitarnos. Si le interesa ser socio, recepción con gusto le cuenta cómo.',
        'salida.PERSONAL': 'Nos vemos pronto, {nombre}. Salida marcada a las {hora}.',
        'salida.EXTERNO': 'Gracias por su trabajo, {trato}. Su salida quedó registrada.',
        'salida.ESCALAMIENTO': 'Gracias por su visita. Hasta pronto.',
        'flujo.VIP': '¡Qué gusto verle de nuevo, {nombre}! Ya avisé al concierge; le acompaño a su reserva.',
        'flujo.REGULAR': 'Hola, {nombre}, qué gusto verle. Siga al salón principal: primera puerta a la derecha.',
        'flujo.INVITADO': 'Hola, {nombre}, le damos la bienvenida a N Club. {anfitrion} le espera en la sala de anfitriones; ya le avisé que llegó.',
        'flujo.PERSONAL': 'Hola, {nombre}. Turno marcado. El acceso de empleados está a su izquierda.',
        'flujo.EXTERNO': 'Hola, {nombre}. Orden de trabajo confirmada. Use casco y chaleco; ya avisé a su supervisor. La entrada de servicio está a la derecha.',
        'flujo.ESCALAMIENTO': 'Un momento, por favor: ya viene alguien de recepción a atenderle.',
        'anfitrion': 'su anfitrión',
        'invitacion_vencida': 'Su invitación ya venció: ya viene alguien de recepción a ayudarle.',
        'sin_rol': 'Le reconozco, pero no tengo su rol registrado: ya viene alguien de recepción.',
        'probable': 'Creo que es {nombre}, pero quiero confirmarlo. Muéstreme su cédula o su pase QR, o dígame su número de cédula, por favor.',
        'voz.cedula_dicha': '(número de cédula {numero})', 'voz.cedula_mirar': 'Gracias. Para confirmarlo con su número, míreme un momento, por favor.',
        'desconocido': 'Aún no le identifico. Muéstreme su cédula o su pase QR, o dígame su número de cédula, por favor.',
        'reintento': 'No le veo bien. Retire la mano o lo que le cubra la cara y míreme, por favor.',
        'listo': '¡Listo, {nombre}! Ya le identifiqué con su {documento}.',
        'doc.cedula': 'cédula', 'doc.pase': 'pase QR',
        'pista.qr_cifrado': 'Ese QR no es un pase de N Club (el de la cédula digital está cifrado): muestre el frente de la cédula o su pase.',
        'pista.cedula_cerca': 'Veo una cédula: acérquela un poco para leer el número.',
        'hint.lejos': 'Acérquese un poco, por favor.', 'hint.oscuro': 'Dé un paso hacia la luz, por favor.',
        'hint.contraluz': 'Hay mucha luz detrás; acérquese un poco.', 'hint.movido': 'No se mueva un segundo, por favor.',
        'hint.perfil': 'Míreme a los ojos, por favor.', 'hint.cubierto': '¿Podría retirarse las gafas, la gorra o la mano de la cara?',
        'hint.varias': 'Por favor, de una persona a la vez.',
        'voz.saludo': '¡Hola! Soy Juan, el asistente de recepción de N Club. Míreme a los ojos y le ubico.',
        'voz.bano': 'Los baños están a la derecha del lobby, junto a recepción.',
        'voz.restaurante': 'El restaurante está en el segundo piso; el ascensor está detrás de mí.',
        'voz.ayuda': 'Puedo reconocerle, leer su cédula o su pase QR y decirle a dónde ir. Si prefiere, llamo a recepción.',
        'voz.recepcion': 'Claro, ya llamé a recepción: alguien viene enseguida.',
        'voz.gracias': '¡Con gusto! Que tenga una excelente visita.',
        'voz.invitado': 'Gracias. Si le invitó un socio, muéstreme su pase QR o su cédula y aviso a su anfitrión.',
        'voz.trabajo': 'Gracias. Muéstreme su carné QR o su cédula y marco su turno.',
        'voz.servicio': 'Gracias. Muéstreme su orden de trabajo en QR o su cédula y aviso a su supervisor.',
        'voz.sin_documento': 'Entiendo. Ya llamé a recepción para que le atiendan.',
        'voz.nombre': 'Mucho gusto, {nombre}.',
        'pregunta.tenis': '¿Desea ir a la cancha de tenis?', 'voz.tenis_si': '¡Con gusto! Le acompaño a la cancha de tenis.', 'voz.tenis_no': 'Perfecto. Si necesita algo, aquí estoy.',
        'voz.idioma': 'Perfecto, sigo en español.',
        'voz.no_entendi': 'No le entendí bien. Puede decir: «empezar», «no tengo cédula», «¿dónde está el baño?» o «ayuda».',
        'voz.chiste': '¿Sabe por qué el robot nunca pierde en el golf? Porque siempre lleva el swing actualizado. | Intenté aprender a bailar, pero mis pasos venían con manual de instrucciones. | ¿Qué le dijo un robot elegante a otro? Tienes una conexión impecable. | ¿Por qué los tenistas son tan buenos amigos? Porque siempre le devuelven la pelota. | Mi médico me dijo que descansara; ahora duermo en modo ahorro de energía. | ¿Qué hace una abeja en el gimnasio? ¡Zum-ba! | ¿Por qué el libro de matemáticas estaba triste? Porque tenía demasiados problemas. | ¿Sabe cuál es el café más peligroso del mundo? El ex-preso. | Le pedí un consejo al ascensor y me dijo que la vida tiene sus altos y sus bajos. | ¿Cuál es el colmo de un electricista? Que su esposa se llame Luz y sus hijos no le sigan la corriente. | Mesero, hay una mosca en mi sopa. Tranquilo, señor, es de las que comen poquito. | ¿Por qué el golfista llevó dos pantalones? Por si hacía un hoyo en uno.',
        'voz.curioso': '¿Sabía que el café colombiano se cultiva en montañas de más de mil metros? Por eso su aroma es tan especial. | Dato curioso: los pulpos tienen tres corazones; yo, con uno de silicio, ya me siento afortunado. | ¿Sabía que la miel nunca se daña? Se han encontrado tarros de miles de años todavía perfectos. | Una bola de golf tiene entre trescientos y quinientos hoyuelos, y gracias a ellos vuela mucho más lejos. | El partido de tenis más largo de la historia duró once horas y cinco minutos, en Wimbledon. | Colombia es el país con más especies de aves del mundo: más de mil novecientas. | Los flamencos son rosados por los camarones y las algas que comen. | La palabra robot viene del checo y significa trabajo; por eso me encanta atenderle. | Un rayo es unas cinco veces más caliente que la superficie del sol. | Las nutrias se toman de la mano al dormir para no separarse.',
    },
    'en': {
        'voz.llamado': 'Yes? Tell me.', 'cumple': 'And happy birthday, {nombre}! Everyone at N Club wishes you a wonderful day.', 'voz.repetir': 'Sorry, I did not quite catch that. Could you say it again, please?', 'voz.quien': 'My name is Juan, the N Club reception robot. A pleasure to assist you.', 'voz.despedida': 'Thank you for your visit. See you soon.',
        'salida.VIP': 'See you soon, {trato}. Thank you for your visit; we look forward to having you back.',
        'salida.REGULAR': 'See you soon, {nombre}. Thank you for your visit; we look forward to having you back.',
        'salida.INVITADO': 'See you soon, {nombre}. Thank you for visiting us. If you are interested in becoming a member, reception will gladly tell you how.',
        'salida.PERSONAL': 'See you soon, {nombre}. Clocked out at {hora}.',
        'salida.EXTERNO': 'Thank you for your work, {trato}. Your exit has been recorded.',
        'salida.ESCALAMIENTO': 'Thank you for your visit. See you soon.',
        'flujo.VIP': 'Welcome back, {nombre}! I have notified the concierge; let me walk you to your reservation.',
        'flujo.REGULAR': 'Hi {nombre}, welcome. Please go to the main lounge: first door on the right.',
        'flujo.INVITADO': 'Hi {nombre}, welcome to N Club. {anfitrion} is waiting for you in the host lounge; I have let them know you arrived.',
        'flujo.PERSONAL': 'Good morning, {nombre}. Your shift is clocked in. The staff entrance is on your left.',
        'flujo.EXTERNO': 'Hello {nombre}. Work order confirmed. Please wear your helmet and vest; I have notified your supervisor. The service entrance is on the right.',
        'flujo.ESCALAMIENTO': 'One moment, please: someone from reception is coming to help you.',
        'anfitrion': 'your host',
        'invitacion_vencida': 'Your invitation has expired: someone from reception is coming to help you.',
        'sin_rol': 'I recognize you, but I do not have your role on file: someone from reception is on the way.',
        'probable': 'You look like {nombre}, but I am not sure. Please show me your ID card or your QR pass, or tell me your ID number.',
        'voz.cedula_dicha': '(ID number {numero})', 'voz.cedula_mirar': 'Thank you. To confirm it with your number, please look at me for a moment.',
        'desconocido': 'I could not identify you. Please show me your ID card or your QR pass, or tell me your ID number.',
        'reintento': 'I cannot see you well. Please move your hand or anything covering your face and look me in the eyes.',
        'listo': 'All set, {nombre}! I identified you with your {documento}.',
        'doc.cedula': 'ID card', 'doc.pase': 'QR pass',
        'pista.qr_cifrado': 'That QR is not an N Club pass (the digital ID card QR is encrypted): show the front of your ID card or your pass.',
        'pista.cedula_cerca': 'I can see an ID card: bring it a little closer so I can read the number.',
        'hint.lejos': 'Please come a little closer.', 'hint.oscuro': 'Please step toward the light.',
        'hint.contraluz': 'There is a lot of light behind you; please come closer.', 'hint.movido': 'Please hold still for a second.',
        'hint.perfil': 'Please look me in the eyes.', 'hint.cubierto': 'Could you remove your glasses, cap or hand from your face?',
        'hint.varias': 'One person at a time, please.',
        'voz.saludo': 'Hello! I am Juan, the N Club reception assistant. Look me in the eyes and I will guide you.',
        'voz.bano': 'The restrooms are to the right of the lobby, next to reception.',
        'voz.restaurante': 'The restaurant is on the second floor; the elevator is behind me.',
        'voz.ayuda': 'I can recognize you, read your ID card or QR pass and tell you where to go. If you prefer, I will call reception.',
        'voz.recepcion': 'Sure, I have called reception: someone will be right with you.',
        'voz.gracias': 'You are welcome! Enjoy your visit.',
        'voz.invitado': 'Thank you. If a member invited you, show me your QR pass or ID card and I will let your host know.',
        'voz.trabajo': 'Thank you. Show me your staff QR badge or ID card and I will clock in your shift.',
        'voz.servicio': 'Thank you. Show me your work order QR or ID card and I will notify your supervisor.',
        'voz.sin_documento': 'I understand. I have called reception to help you.',
        'voz.nombre': 'Nice to meet you, {nombre}.',
        'pregunta.tenis': 'Would you like to go to the tennis court?', 'voz.tenis_si': 'Come with me, I will take you to the tennis court!', 'voz.tenis_no': 'Alright. If you need anything, I am right here.',
        'voz.idioma': 'Great, I will continue in English.',
        'voz.no_entendi': 'Sorry, I did not catch that. You can say "start", "I don\'t have an ID", "where is the restroom?" or "help".',
        'voz.chiste': 'Why do robots never lose at golf? Their swing is always fully updated. | I tried to learn to dance, but my moves came with an instruction manual. | What did one elegant robot say to the other? You have an impeccable connection. | Why are tennis players such good friends? They always return the ball. | My doctor told me to rest, so now I sleep in energy saving mode. | What does a bee do at the gym? Zumba! | Why was the math book sad? It had too many problems. | Why did the coffee file a police report? It got mugged. | I asked the elevator for advice, and it said life has its ups and downs. | What do you call a fake noodle? An impasta. | Waiter, there is a fly in my soup. Do not worry, sir, it will not eat much. | Why did the golfer bring two pairs of trousers? In case he got a hole in one.',
        'voz.curioso': 'Did you know Colombian coffee grows on mountains above one thousand meters? That is why it smells so good. | Fun fact: octopuses have three hearts; with my single silicon one, I already feel lucky. | Did you know honey never spoils? Jars thousands of years old have been found still perfect. | A golf ball has between three hundred and five hundred dimples, and they help it fly much farther. | The longest tennis match in history lasted eleven hours and five minutes, at Wimbledon. | Colombia has more bird species than any other country: over one thousand nine hundred. | Flamingos are pink because of the shrimp and algae they eat. | The word robot comes from Czech and means work; that is why I love serving you. | A lightning bolt is about five times hotter than the surface of the sun. | Sea otters hold hands while they sleep so they do not drift apart.',
    },
    'zh': {
        'voz.llamado': '在的，请说。', 'cumple': '还有，祝{nombre}生日快乐！N俱乐部全体祝您度过美好的一天。', 'voz.repetir': '抱歉，我没听清楚。请您再说一遍好吗？', 'voz.quien': '我叫胡安，是N俱乐部的接待机器人。很高兴为您服务。', 'voz.despedida': '感谢您的光临，再见。',
        'salida.VIP': '{trato}，再见。感谢您的光临，期待您再次到来。',
        'salida.REGULAR': '{nombre}，再见。感谢您的光临，期待您再次到来。',
        'salida.INVITADO': '{nombre}，再见。感谢您的来访。如果您有兴趣成为会员，前台很乐意为您介绍。',
        'salida.PERSONAL': '{nombre}，明天见。已在 {hora} 为您打卡下班。',
        'salida.EXTERNO': '{trato}，感谢您的工作。您的离开已登记。',
        'salida.ESCALAMIENTO': '感谢您的光临，再见。',
        'flujo.VIP': '{nombre}，欢迎回来！我已经通知了礼宾部，我陪您去您的预订位置。',
        'flujo.REGULAR': '{nombre}，您好，欢迎光临。请前往主厅：右手边第一扇门。',
        'flujo.INVITADO': '{nombre}，您好，欢迎来到 N Club。{anfitrion}正在接待厅等您，我已经通知他您到了。',
        'flujo.PERSONAL': '{nombre}，早上好。已为您打卡。员工通道在您的左边。',
        'flujo.EXTERNO': '{nombre}，您好。工单已确认。请戴好安全帽和反光背心，我已通知您的主管。服务入口在右边。',
        'flujo.ESCALAMIENTO': '请稍等，前台的工作人员马上过来为您服务。',
        'anfitrion': '您的邀请人',
        'invitacion_vencida': '您的邀请已过期，前台工作人员马上过来帮您。',
        'sin_rol': '我认出了您，但系统里没有您的身份登记，前台工作人员马上过来。',
        'probable': '您看起来像{nombre}，但我不太确定。请出示您的身份证或二维码通行证，或者告诉我您的身份证号码。',
        'voz.cedula_dicha': '（身份证号码 {numero}）', 'voz.cedula_mirar': '谢谢。要用号码确认，请看着我一会儿。',
        'desconocido': '我没能识别您。请出示您的身份证或二维码通行证，或者告诉我您的身份证号码。',
        'reintento': '我看不清您。请把手或遮挡物从脸上移开，看着我的眼睛。',
        'listo': '好了，{nombre}！我已通过您的{documento}确认了您的身份。',
        'doc.cedula': '身份证', 'doc.pase': '二维码通行证',
        'pista.qr_cifrado': '这个二维码不是 N Club 通行证（电子身份证的二维码是加密的）：请出示身份证正面或您的通行证。',
        'pista.cedula_cerca': '我看到了一张身份证：请再靠近一点，我好读取号码。',
        'hint.lejos': '请再靠近一点。', 'hint.oscuro': '请往亮一点的地方站。',
        'hint.contraluz': '您身后光线太强，请靠近一点。', 'hint.movido': '请保持不动一秒钟。',
        'hint.perfil': '请看着我的眼睛。', 'hint.cubierto': '可以摘下眼镜、帽子或把手从脸上移开吗？',
        'hint.varias': '请一次一位。',
        'voz.saludo': '您好！我是 N Club 的前台助理胡安。请看着我的眼睛，我来为您指引。',
        'voz.bano': '洗手间在大堂右侧，前台旁边。',
        'voz.restaurante': '餐厅在二楼，电梯就在我身后。',
        'voz.ayuda': '我可以识别您、读取您的身份证或二维码通行证，并告诉您该去哪里。如果您愿意，我可以叫前台。',
        'voz.recepcion': '好的，我已经叫了前台，马上有人来。',
        'voz.gracias': '不客气！祝您访问愉快。',
        'voz.invitado': '谢谢。如果是会员邀请您的，请出示您的二维码通行证或身份证，我会通知您的邀请人。',
        'voz.trabajo': '谢谢。请出示您的员工二维码或身份证，我来为您打卡。',
        'voz.servicio': '谢谢。请出示您的工单二维码或身份证，我会通知您的主管。',
        'voz.sin_documento': '明白了。我已经叫前台来为您服务。',
        'voz.nombre': '{nombre}，很高兴认识您。',
        'pregunta.tenis': '您想去网球场吗？', 'voz.tenis_si': '跟我来，我带您去网球场！', 'voz.tenis_no': '好的。如果需要帮忙，我就在这里。',
        'voz.idioma': '好的，我将用中文继续。',
        'voz.no_entendi': '抱歉，我没听清。您可以说：“开始”、“我没有证件”、“洗手间在哪里？”或“帮助”。',
        'voz.chiste': '为什么机器人打高尔夫从不输？因为它的挥杆一直在更新。 | 我试过学跳舞，可是我的舞步还附带说明书。 | 一个优雅的机器人对另一个说什么？你的连接真完美。 | 为什么网球选手都是好朋友？因为他们总会把球还给你。 | 医生让我多休息，所以我现在用省电模式睡觉。 | 蜜蜂去健身房做什么？跳尊巴！ | 为什么数学书总是很难过？因为它的问题太多了。 | 我问电梯有什么人生建议，它说：人生总有起起落落。 | 服务员，我的汤里有只苍蝇。先生别担心，它吃不了多少。 | 我是机器人，从来不说谎，最多只是系统正在更新。 | 为什么时钟总是很累？因为它一天到晚都在转。 | 机器人最怕听到什么？你今天怎么没电了。',
        'voz.curioso': '您知道吗？哥伦比亚咖啡种在海拔一千米以上的山上，所以特别香。 | 有趣的事实：章鱼有三颗心脏；我只有一颗硅做的，已经很幸运了。 | 您知道吗？蜂蜜永远不会变质，人们发现过几千年前的蜂蜜依然完好。 | 一个高尔夫球上有三百到五百个小凹坑，正是它们让球飞得更远。 | 历史上最长的网球比赛持续了十一小时零五分钟，是在温布尔登。 | 哥伦比亚是世界上鸟类最多的国家，有一千九百多种。 | 火烈鸟是粉红色的，因为它们吃虾和藻类。 | 机器人这个词来自捷克语，意思是工作，所以我很乐意为您服务。 | 闪电的温度大约是太阳表面的五倍。 | 海獭睡觉时会手牵手，这样就不会漂散。',
    },
    'pt': {
        'voz.llamado': 'Sim? Pode falar.', 'cumple': 'E feliz aniversário, {nombre}! Todo o N Club deseja a você um dia maravilhoso.', 'voz.repetir': 'Desculpe, não ouvi bem. Pode repetir, por favor?', 'voz.quien': 'Meu nome é Juan, o robô da recepção do N Club. É um prazer atender você.', 'voz.despedida': 'Obrigado pela visita. Até logo.',
        'salida.VIP': 'Até logo, {trato}. Obrigado pela visita; esperamos você de volta.',
        'salida.REGULAR': 'Até logo, {nombre}. Obrigado pela visita; esperamos você de volta.',
        'salida.INVITADO': 'Até logo, {nombre}. Obrigado pela visita. Se tiver interesse em ser sócio, a recepção terá prazer em explicar como.',
        'salida.PERSONAL': 'Até breve, {nombre}. Saída registrada às {hora}.',
        'salida.EXTERNO': 'Obrigado pelo seu trabalho, {trato}. Sua saída foi registrada.',
        'salida.ESCALAMIENTO': 'Obrigado pela visita. Até logo.',
        'flujo.VIP': 'Bem-vindo de volta, {nombre}! Já avisei o concierge; vou acompanhá-lo até a sua reserva.',
        'flujo.REGULAR': 'Olá, {nombre}, bem-vindo. Siga para o salão principal: primeira porta à direita.',
        'flujo.INVITADO': 'Olá, {nombre}, bem-vindo ao N Club. {anfitrion} está esperando na sala de anfitriões; já avisei que você chegou.',
        'flujo.PERSONAL': 'Bom dia, {nombre}. Ponto registrado. A entrada de funcionários fica à sua esquerda.',
        'flujo.EXTERNO': 'Olá, {nombre}. Ordem de serviço confirmada. Use capacete e colete; já avisei o seu supervisor. A entrada de serviço fica à direita.',
        'flujo.ESCALAMIENTO': 'Um momento, por favor: alguém da recepção já vem atendê-lo.',
        'anfitrion': 'seu anfitrião',
        'invitacion_vencida': 'Seu convite já venceu: alguém da recepção já vem ajudar você.',
        'sin_rol': 'Eu reconheço você, mas não tenho a sua função registrada: alguém da recepção já está vindo.',
        'probable': 'Você parece {nombre}, mas não tenho certeza. Mostre seu documento de identidade ou seu passe QR, ou diga o número do seu documento, por favor.',
        'voz.cedula_dicha': '(número do documento {numero})', 'voz.cedula_mirar': 'Obrigado. Para confirmar com o seu número, olhe para mim um momento, por favor.',
        'desconocido': 'Não consegui identificar você. Mostre seu documento de identidade ou seu passe QR, ou diga o número do seu documento, por favor.',
        'reintento': 'Não consigo ver você bem. Tire a mão ou o que estiver cobrindo o rosto e olhe nos meus olhos, por favor.',
        'listo': 'Pronto, {nombre}! Identifiquei você com o seu {documento}.',
        'doc.cedula': 'documento de identidade', 'doc.pase': 'passe QR',
        'pista.qr_cifrado': 'Esse QR não é um passe do N Club (o da identidade digital é criptografado): mostre a frente do documento ou o seu passe.',
        'pista.cedula_cerca': 'Estou vendo um documento: aproxime um pouco para eu ler o número.',
        'hint.lejos': 'Aproxime-se um pouco, por favor.', 'hint.oscuro': 'Dê um passo em direção à luz, por favor.',
        'hint.contraluz': 'Há muita luz atrás de você; aproxime-se um pouco.', 'hint.movido': 'Fique parado um segundo, por favor.',
        'hint.perfil': 'Olhe nos meus olhos, por favor.', 'hint.cubierto': 'Poderia tirar os óculos, o boné ou a mão do rosto?',
        'hint.varias': 'Uma pessoa de cada vez, por favor.',
        'voz.saludo': 'Olá! Eu sou o Juan, o assistente da recepção do N Club. Olhe nos meus olhos e eu oriento você.',
        'voz.bano': 'Os banheiros ficam à direita do lobby, ao lado da recepção.',
        'voz.restaurante': 'O restaurante fica no segundo andar; o elevador está atrás de mim.',
        'voz.ayuda': 'Posso reconhecer você, ler seu documento ou passe QR e dizer aonde ir. Se preferir, chamo a recepção.',
        'voz.recepcion': 'Claro, já chamei a recepção: alguém vem em seguida.',
        'voz.gracias': 'De nada! Tenha uma ótima visita.',
        'voz.invitado': 'Obrigado. Se um sócio convidou você, mostre seu passe QR ou documento e eu aviso o seu anfitrião.',
        'voz.trabajo': 'Obrigado. Mostre seu crachá QR ou documento e eu registro o seu ponto.',
        'voz.servicio': 'Obrigado. Mostre sua ordem de serviço em QR ou documento e eu aviso o seu supervisor.',
        'voz.sin_documento': 'Entendo. Já chamei a recepção para atender você.',
        'voz.nombre': 'Muito prazer, {nombre}.',
        'pregunta.tenis': 'Quer ir à quadra de tênis?', 'voz.tenis_si': 'Venha, eu acompanho você até a quadra de tênis!', 'voz.tenis_no': 'Perfeito. Se precisar de algo, estou aqui.',
        'voz.idioma': 'Perfeito, continuo em português.',
        'voz.no_entendi': 'Não entendi bem. Você pode dizer: "começar", "não tenho documento", "onde fica o banheiro?" ou "ajuda".',
        'voz.chiste': 'Sabe por que o robô nunca perde no golfe? Porque o swing dele está sempre atualizado. | Tentei aprender a dançar, mas meus passos vieram com manual de instruções. | O que um robô elegante disse ao outro? Você tem uma conexão impecável. | Por que os tenistas são ótimos amigos? Porque sempre devolvem a bola. | Meu médico mandou eu descansar; agora durmo em modo de economia de energia. | O que a abelha faz na academia? Zum-ba! | Por que o livro de matemática estava triste? Porque tinha problemas demais. | Qual é o café mais perigoso do mundo? O ex-presso. | Pedi um conselho ao elevador e ele disse que a vida tem altos e baixos. | Qual é o cúmulo do eletricista? A esposa se chamar Luz e os filhos não seguirem a corrente. | Garçom, tem uma mosca na minha sopa. Calma, senhor, ela come pouquinho. | Por que o golfista levou duas calças? Caso fizesse um buraco em uma.',
        'voz.curioso': 'Sabia que o café colombiano é cultivado em montanhas a mais de mil metros? Por isso o aroma é tão especial. | Curiosidade: o polvo tem três corações; eu, com um de silício, já me sinto sortudo. | Sabia que o mel nunca estraga? Já encontraram potes de milhares de anos ainda perfeitos. | Uma bola de golfe tem entre trezentas e quinhentas covinhas, e graças a elas voa muito mais longe. | A partida de tênis mais longa da história durou onze horas e cinco minutos, em Wimbledon. | A Colômbia é o país com mais espécies de aves do mundo: mais de mil e novecentas. | Os flamingos são cor-de-rosa por causa dos camarões e das algas que comem. | A palavra robô vem do tcheco e significa trabalho; por isso adoro atender você. | Um raio é cerca de cinco vezes mais quente que a superfície do sol. | As lontras dormem de mãos dadas para não se separarem.',
    },
}

# robotA/vision/quality.py y verify.py devuelven las pistas como frases en espanol: se mapean a su codigo
HINT_CODES = {'Acerquese un poco, por favor': 'lejos', 'De un paso hacia la luz, por favor': 'oscuro',
              'Hay mucha luz detras; acerquese un poco': 'contraluz', 'Quedese quieto un segundo, por favor': 'movido',
              'Mire hacia mi pantalla, por favor': 'perfil', 'Podria retirarse un momento las gafas o la gorra?': 'cubierto',
              'Por favor, de a una persona a la vez': 'varias'}


def lang_of(lang):
    return lang if lang in IDIOMAS else 'es'


def t(lang, key, **data):
    lang = lang_of(lang)
    text = T[lang].get(key) or T['es'][key]
    if '{anfitrion}' in text and not data.get('anfitrion'):
        data['anfitrion'] = T[lang]['anfitrion']
    return text.format_map({'nombre': '', 'documento': '', 'anfitrion': '', **data})


def hints(lang, spanish_hints):
    return [t(lang, 'hint.' + HINT_CODES[h]) if h in HINT_CODES else h for h in spanish_hints]


if __name__ == '__main__':
    keys = set(T['es'])
    for lang in IDIOMAS:
        missing = keys - set(T[lang])
        assert not missing, (lang, missing)
        for k in keys:
            t(lang, k, nombre='Ana', documento=t(lang, 'doc.cedula'), trato='Ana', hora='9', numero='1')   # todas formatean
    from quality import HINTS                                              # noqa: E402 (robotA/vision en el path)
    assert set(HINT_CODES.values()) - {'varias'} == set(HINTS) and set(HINT_CODES) - {'Por favor, de a una persona a la vez'} == set(HINTS.values())
    assert t('fr', 'listo', nombre='Ana', documento='x').startswith('¡Listo, Ana')  # idioma desconocido -> espanol
    print('textos OK:', ', '.join(f'{k} {len(T[k])}' for k in IDIOMAS))
