#!/usr/bin/env bash
# Smoke test of the club API (app + robot) against production or $API. The robot key is read from
# ~/.config/nclub/bot-key and never printed. Usage: bash scripts/smoke-club.sh
set -u
A=${API:-https://n-club-five.vercel.app/api}
KEY=$(cat ~/.config/nclub/bot-key) || { echo "falta ~/.config/nclub/bot-key"; exit 1; }
H="X-Bot-Key: $KEY"; F=$(TZ=America/Bogota date +%F); NOW=$(TZ=America/Bogota date -Iseconds)
j() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
T=$(curl -s $A/auth/login --json '{"email":"andres@nclub.demo","clave":"nclub-demo-2026"}' | j 'd["token"]')
C=$(curl -s $A/auth/login --json '{"email":"concierge@nclub.demo","clave":"nclub-demo-2026"}' | j 'd["token"]')
INV=$(curl -s $A/invitaciones -H "Authorization: Bearer $T" --json "{\"nombre\":\"Prueba\",\"apellido\":\"Robot\",\"trato\":\"senor\",\"fecha\":\"$F\",\"hora_desde\":\"00:00\",\"hora_hasta\":\"23:59\",\"lugar\":\"INVITADO\"}")
ID=$(echo "$INV" | j 'd["id"]'); P=$(echo "$INV" | j 'd["persona_id"]')
echo "1 registros: $(curl -s "$A/bot/registros?fecha=$F" -H "$H" | j "'agenda ok' if '$P' in d['agenda'] else 'FALTA', 'turnos en_turno' if all('en_turno' in t for t in d['turnos'].values()) else 'SIN en_turno'")"
python3 -c "import base64;open('/tmp/nclub-smoke.jpg','wb').write(base64.b64decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='))"
curl -s -X PUT $A/invitaciones/$ID/foto -H "Authorization: Bearer $T" -F "foto=@/tmp/nclub-smoke.jpg;type=image/jpeg" -F consentimiento=true -o /dev/null -w "2 foto subida %{http_code}\n"
U=$(curl -s $A/bot/fotos/pendientes -H "$H" | j "[i['url'] for i in d['items'] if i['invitacion_id']=='$ID'][0]")
curl -s "$U" -o /dev/null -w "3 robot descarga %{http_code} %{content_type}\n"
echo "4 resultado: $(curl -s $A/bot/fotos/$ID/resultado -H "$H" --json '{"ok":true}' | j 'd["foto_estado"]')"
E=$(python3 -c 'import uuid;print(uuid.uuid4())')
EV="{\"id\":\"$E\",\"ts\":\"$NOW\",\"tipo\":\"LLEGADA\",\"categoria\":\"INVITADO\",\"persona_id\":\"$P\",\"nombre\":\"Prueba Robot\",\"anfitrion_id\":\"andres\",\"destino\":\"Sala de anfitriones\",\"avisar\":[\"anfitrion\",\"concierge\"],\"severidad\":\"info\",\"requiere_atencion\":true,\"motivo\":\"prueba\",\"evidencia\":{\"metodo\":\"rostro\"}}"
curl -s $A/bot/eventos -H "$H" --json "$EV" -o /dev/null -w "5 evento %{http_code}\n"
echo "6 duplicado: $(curl -s $A/bot/eventos -H "$H" --json "$EV")"
echo "7 invitacion: $(curl -s $A/invitaciones/$ID -H "Authorization: Bearer $T" | j 'd["estado"]')"
curl -s -X POST $A/eventos/$E/atender -H "Authorization: Bearer $C" -o /dev/null -w "8 concierge atiende %{http_code}\n"
echo "9 robot consulta evento: $(curl -s $A/bot/eventos/$E -H "$H")"
CF=$(python3 -c 'import uuid;print(uuid.uuid4())')
curl -s $A/bot/confirmaciones -H "$H" --json "{\"id\":\"$CF\",\"anfitrion_id\":\"andres\",\"visitante_desc\":\"Dice llamarse Pedro\",\"evento_id\":null,\"vence_en_s\":45}" -o /dev/null -w "10 confirmacion %{http_code}\n"
curl -s -X POST $A/confirmaciones/$CF/responder -H "Authorization: Bearer $T" --json '{"aprueba":true}' -o /dev/null -w "11 socio responde %{http_code}\n"
echo "12 robot lee: $(curl -s $A/bot/confirmaciones/$CF -H "$H" | j 'd["estado"]')"
curl -s $A/bot/heartbeat -H "$H" --json '{"robot":"x2-1","estado":"ok","detalle":""}' -o /dev/null -w "13 latido %{http_code}\n"
echo "14 robot/estado: $(curl -s $A/robot/estado -H "Authorization: Bearer $C" | j 'd["en_linea"], d["estado"]')"
curl -s -X POST $A/bot/eventos -H "$H" --json "{\"id\":\"$(python3 -c 'import uuid;print(uuid.uuid4())')\",\"ts\":\"$NOW\",\"tipo\":\"SALIDA\",\"categoria\":\"INVITADO\",\"persona_id\":\"$P\",\"nombre\":\"Prueba Robot\",\"anfitrion_id\":\"andres\",\"avisar\":[\"anfitrion\"],\"severidad\":\"info\",\"requiere_atencion\":false}" -o /dev/null -w "15 salida %{http_code}\n"
echo "16 fuera de agenda: $(curl -s "$A/bot/registros?fecha=$F" -H "$H" | j "'si' if '$P' not in d['agenda'] else 'NO'")"
echo "17 sin llave: $(curl -s -o /dev/null -w '%{http_code}' $A/bot/registros)"
